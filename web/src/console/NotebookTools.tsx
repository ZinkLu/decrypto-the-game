import { translate } from './i18n';
import './notebook-tools.css';

type Tool = 'type' | 'view' | 'pen' | 'eraser';
interface Props {
    tool: Tool;
    onToolChange: (tool: Exclude<Tool, 'view'>) => void;
    canUndo: boolean;
    onUndo: () => void;
    locale: 'zh' | 'en';
}

export default function NotebookTools({ tool, onToolChange, canUndo, onUndo, locale }: Props) {
    const t = (message: string) => translate(locale, message);
    const pencilLabel = t(tool === 'pen' ? '放回铅笔' : '拿起铅笔');
    const eraserLabel = t(tool === 'eraser' ? '放回橡皮' : '拿起橡皮');

    return <div className="notebook-toolbar notebook-objects" role="group" aria-label={t('笔记工具')}>
        <button type="button" className="notebook-object notebook-pencil" aria-pressed={tool === 'pen'}
            aria-label={pencilLabel} title={pencilLabel} onClick={() => onToolChange(tool === 'pen' ? 'type' : 'pen')}>
            <span className="notebook-object-shadow" aria-hidden="true" />
            <span className="notebook-pencil-object" aria-hidden="true">
                <span className="notebook-pencil-wood" />
                <span className="notebook-pencil-graphite" />
                <span className="notebook-pencil-barrel" />
                <span className="notebook-pencil-cap" />
            </span>
        </button>
        <button type="button" className="notebook-object notebook-eraser" aria-pressed={tool === 'eraser'}
            aria-label={eraserLabel} title={eraserLabel} onClick={() => onToolChange(tool === 'eraser' ? 'type' : 'eraser')}>
            <span className="notebook-object-shadow" aria-hidden="true" />
            <span className="notebook-eraser-object" aria-hidden="true"><span className="notebook-eraser-sleeve" /></span>
        </button>
        {canUndo && <button type="button" className="notebook-object-undo" aria-label={t('撤销笔迹')} title={t('撤销笔迹')} onClick={onUndo}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4-4 4 4 4M3 8h8a4 4 0 0 1 0 8H8" /></svg>
        </button>}
    </div>;
}
