import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import 'vazirmatn/Vazirmatn-Variable-font-face.css'

// roundRect polyfill برای Safari قدیمی‌تر از 16.4 و WebViewهای قدیمی اندروید —
// رندرکنندهٔ بوم در هر فریم ctx.roundRect صدا می‌زند و بدون این بوم سیاه می‌شود
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    this: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, radii?: number | DOMPointInit | (number | DOMPointInit)[],
  ): CanvasRenderingContext2D {
    const r0 = typeof radii === 'number' ? radii : Array.isArray(radii) ? radii[0] : radii
    const rr = Math.min(Math.max(typeof r0 === 'number' ? r0 : 0, 0), Math.abs(w) / 2, Math.abs(h) / 2)
    this.moveTo(x + rr, y)
    this.lineTo(x + w - rr, y)
    this.arcTo(x + w, y, x + w, y + rr, rr)
    this.lineTo(x + w, y + h - rr)
    this.arcTo(x + w, y + h, x + w - rr, y + h, rr)
    this.lineTo(x + rr, y + h)
    this.arcTo(x, y + h, x, y + h - rr, rr)
    this.lineTo(x, y + rr)
    this.arcTo(x, y, x + rr, y, rr)
    this.closePath()
    return this
  } as typeof CanvasRenderingContext2D.prototype.roundRect
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
