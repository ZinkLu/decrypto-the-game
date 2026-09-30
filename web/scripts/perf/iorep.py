#!/usr/bin/env python3
"""System-wide energy per rail and GPU performance-state residency from IOReport, without sudo.

    from iorep import Sampler
    s = Sampler(); a = s.sample(); ...; d = s.delta(a, s.sample())
    d['energy']['GPU Energy']  # joules over the window
    d['gpu_states']            # residency per state: OFF, P1 ... P15

This is the source powermetrics reads, through the private /usr/lib/libIOReport.dylib.
"""
import ctypes, ctypes.util, time, sys

cf = ctypes.cdll.LoadLibrary(ctypes.util.find_library('CoreFoundation'))
ior = ctypes.cdll.LoadLibrary('/usr/lib/libIOReport.dylib')
V = ctypes.c_void_p
cf.CFStringCreateWithCString.restype = V; cf.CFStringCreateWithCString.argtypes = [V, ctypes.c_char_p, ctypes.c_uint32]
cf.CFStringGetCString.restype = ctypes.c_bool; cf.CFStringGetCString.argtypes = [V, ctypes.c_char_p, ctypes.c_long, ctypes.c_uint32]
cf.CFDictionaryGetValue.restype = V; cf.CFDictionaryGetValue.argtypes = [V, V]
cf.CFArrayGetCount.restype = ctypes.c_long; cf.CFArrayGetCount.argtypes = [V]
cf.CFArrayGetValueAtIndex.restype = V; cf.CFArrayGetValueAtIndex.argtypes = [V, ctypes.c_long]
cf.CFRelease.argtypes = [V]
cf.CFDictionaryCreateMutableCopy.restype = V; cf.CFDictionaryCreateMutableCopy.argtypes = [V, ctypes.c_long, V]
cf.CFDictionaryGetCount.restype = ctypes.c_long; cf.CFDictionaryGetCount.argtypes = [V]
ior.IOReportCopyChannelsInGroup.restype = V; ior.IOReportCopyChannelsInGroup.argtypes = [V, V, ctypes.c_uint64, ctypes.c_uint64, ctypes.c_uint64]
ior.IOReportMergeChannels.argtypes = [V, V, V]
ior.IOReportCreateSubscription.restype = V; ior.IOReportCreateSubscription.argtypes = [V, V, ctypes.POINTER(V), ctypes.c_uint64, V]
ior.IOReportCreateSamples.restype = V; ior.IOReportCreateSamples.argtypes = [V, V, V]
ior.IOReportCreateSamplesDelta.restype = V; ior.IOReportCreateSamplesDelta.argtypes = [V, V, V]
for name in ['IOReportChannelGetGroup', 'IOReportChannelGetChannelName', 'IOReportChannelGetUnitLabel', 'IOReportStateGetNameForIndex']:
    getattr(ior, name).restype = V
ior.IOReportChannelGetGroup.argtypes = [V]; ior.IOReportChannelGetChannelName.argtypes = [V]; ior.IOReportChannelGetUnitLabel.argtypes = [V]
ior.IOReportSimpleGetIntegerValue.restype = ctypes.c_int64; ior.IOReportSimpleGetIntegerValue.argtypes = [V, V]
ior.IOReportStateGetCount.restype = ctypes.c_int32; ior.IOReportStateGetCount.argtypes = [V]
ior.IOReportStateGetNameForIndex.argtypes = [V, ctypes.c_int32]
ior.IOReportStateGetResidency.restype = ctypes.c_int64; ior.IOReportStateGetResidency.argtypes = [V, ctypes.c_int32]
UTF8 = 0x08000100

def cfs(s): return cf.CFStringCreateWithCString(None, s.encode(), UTF8)
def pys(ref):
    if not ref: return ''
    buf = ctypes.create_string_buffer(256)
    return buf.value.decode() if cf.CFStringGetCString(ref, buf, 256, UTF8) else ''

class Sampler:
    def __init__(self):
        energy = ior.IOReportCopyChannelsInGroup(cfs('Energy Model'), None, 0, 0, 0)
        gpu = ior.IOReportCopyChannelsInGroup(cfs('GPU Stats'), cfs('GPU Performance States'), 0, 0, 0)
        ior.IOReportMergeChannels(energy, gpu, None)
        self.channels = cf.CFDictionaryCreateMutableCopy(None, cf.CFDictionaryGetCount(energy), energy)
        subbed = V()
        self.sub = ior.IOReportCreateSubscription(None, self.channels, ctypes.byref(subbed), 0, None)
        self.subbed = subbed

    def sample(self):
        return (time.time(), ior.IOReportCreateSamples(self.sub, self.subbed, None))

    def delta(self, a, b):
        d = ior.IOReportCreateSamplesDelta(a[1], b[1], None)
        channels = cf.CFDictionaryGetValue(d, cfs('IOReportChannels'))
        out = {'seconds': b[0] - a[0], 'energy': {}, 'gpu_states': {}}
        for i in range(cf.CFArrayGetCount(channels)):
            ch = cf.CFArrayGetValueAtIndex(channels, i)
            group, name, unit = pys(ior.IOReportChannelGetGroup(ch)), pys(ior.IOReportChannelGetChannelName(ch)), pys(ior.IOReportChannelGetUnitLabel(ch))
            if group == 'Energy Model':
                scale = {'nJ': 1e-9, 'uJ': 1e-6, 'mJ': 1e-3}.get(unit)
                if scale: out['energy'][name] = out['energy'].get(name, 0) + ior.IOReportSimpleGetIntegerValue(ch, None) * scale
            elif group == 'GPU Stats' and name == 'GPUPH':
                for k in range(ior.IOReportStateGetCount(ch)):
                    out['gpu_states'][pys(ior.IOReportStateGetNameForIndex(ch, k))] = ior.IOReportStateGetResidency(ch, k)
        cf.CFRelease(d)
        return out

if __name__ == '__main__':
    s = Sampler(); window = float(sys.argv[1]) if len(sys.argv) > 1 else 3
    a = s.sample(); time.sleep(window); d = s.delta(a, s.sample())
    print({k: round(v / d['seconds'], 3) for k, v in sorted(d['energy'].items(), key=lambda x: -x[1])[:10]})
    total = sum(d['gpu_states'].values()) or 1
    print({k: f'{v / total * 100:.1f}%' for k, v in d['gpu_states'].items() if v})
