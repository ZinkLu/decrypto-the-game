import { lazy, Suspense } from 'react';
const Console = lazy(() => import('./components/console/Console'));
export default function App() {
  return <Suspense fallback={<div className="station-loading"><strong>DECRYPTO</strong><span>正在接通密码终端…</span></div>}><Console /></Suspense>;
}
