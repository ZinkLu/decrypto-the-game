import { readLocale, translate } from './console/i18n';
import { lazy, Suspense } from 'react';
const Console = lazy(() => import('./console/Console'));
export default function App() {
  return <Suspense fallback={<div className="station-loading"><strong>ENCRYPTO</strong><span>{translate(readLocale(), '正在启动密码终端…')}</span></div>}><Console /></Suspense>;
}
