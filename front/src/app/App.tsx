import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useAnimate } from "motion/react";
import {
  TrendingUp, TrendingDown, X, ChevronUp, ChevronDown,
  ChevronsUpDown, AlertCircle, CheckCircle2, BookOpen,
  Wallet, Clock, BarChart2, Zap, RefreshCw
} from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const F = { display: "'Syne', sans-serif", body: "'Instrument Sans', sans-serif", mono: "'DM Mono', monospace" };

// ─── Card palette (exact from reference) ──────────────────────────────────────
const PALETTE = [
  { bg: "#b3cad6", bar: "rgba(50,100,130,0.3)", barHi: "#3d7da0", fg: "#0d1e26", sub: "#3d6070" },
  { bg: "#cac4b8", bar: "rgba(90,80,60,0.28)", barHi: "#7a6e58", fg: "#221c10", sub: "#625844" },
  { bg: "#bcc6c0", bar: "rgba(55,90,70,0.28)", barHi: "#4a7860", fg: "#101e18", sub: "#3a5e4a" },
  { bg: "#cdff00", bar: "rgba(80,120,0,0.28)", barHi: "#5a8c00", fg: "#0f1a00", sub: "#2e4a00" },
  { bg: "#c2bbd2", bar: "rgba(70,55,100,0.28)", barHi: "#5e50a0", fg: "#18122a", sub: "#4a3870" },
  { bg: "#d2c3b6", bar: "rgba(100,65,45,0.28)", barHi: "#7a5040", fg: "#221410", sub: "#604030" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type Side = "BUY" | "SELL";
type OType = "LIMIT" | "MARKET";
type OStatus = "OPEN" | "FILLED" | "PARTIAL" | "CANCELLED";
interface Order { id:string; ticker:string; side:Side; type:OType; price:number; quantity:number; filled:number; status:OStatus; timestamp:number }
interface Trade { id:string; ticker:string; price:number; quantity:number; side:Side; timestamp:number }
interface Stock { ticker:string; name:string; price:number; prevPrice:number; change:number; changePct:number; volume:number; history:number[]; colorIdx:number }
interface Position { ticker:string; quantity:number; avgCost:number; currentPrice:number }

// ─── FIFO Engine ──────────────────────────────────────────────────────────────
class Engine {
  bids: Order[] = []; asks: Order[] = [];
  place(o: Order): Trade[] {
    const ts: Trade[] = [];
    if (o.type === "MARKET") o.price = o.side === "BUY" ? 9999999 : 0;
    const book = o.side === "BUY" ? this.asks : this.bids;
    book.sort(o.side === "BUY"
      ? (a, b) => a.price !== b.price ? a.price - b.price : a.timestamp - b.timestamp
      : (a, b) => a.price !== b.price ? b.price - a.price : a.timestamp - b.timestamp);
    while (o.filled < o.quantity && book.length) {
      const top = book[0];
      if (o.side === "BUY" && top.price > o.price) break;
      if (o.side === "SELL" && top.price < o.price) break;
      const qty = Math.min(o.quantity - o.filled, top.quantity - top.filled);
      o.filled += qty; top.filled += qty;
      ts.push({ id: uid(), ticker: o.ticker, price: top.price, quantity: qty, side: o.side, timestamp: Date.now() });
      if (top.filled >= top.quantity) { top.status = "FILLED"; book.shift(); } else top.status = "PARTIAL";
    }
    if (o.filled >= o.quantity) o.status = "FILLED";
    else if (o.filled > 0) o.status = "PARTIAL";
    if (o.type === "LIMIT" && o.status !== "FILLED") { (o.side === "BUY" ? this.bids : this.asks).push(o); }
    return ts;
  }
  book(ticker: string) {
    return {
      bids: this.bids.filter(o => o.ticker === ticker && o.status !== "FILLED" && o.status !== "CANCELLED").sort((a,b) => b.price - a.price).slice(0,7),
      asks: this.asks.filter(o => o.ticker === ticker && o.status !== "FILLED" && o.status !== "CANCELLED").sort((a,b) => a.price - b.price).slice(0,7),
    };
  }
  cancel(id: string) {
    for (const arr of [this.bids, this.asks]) {
      const i = arr.findIndex(o => o.id === id);
      if (i >= 0) { arr[i].status = "CANCELLED"; arr.splice(i, 1); return; }
    }
  }
}
const engine = new Engine();

// ─── Utils ────────────────────────────────────────────────────────────────────
const uid = () => crypto.randomUUID();
const f3 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const f2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fv = (n: number) => n.toLocaleString("en-US");

// ─── Stock data ───────────────────────────────────────────────────────────────
const STOCKS: Stock[] = [
  { ticker:"QNBK", name:"Qatar National Bank",     price:1.5802,  prevPrice:1.5802,  change:-0.00014, changePct:-0.009, volume:2389422, history:[1.56,1.562,1.558,1.571,1.565,1.559,1.563,1.572,1.568,1.574,1.579,1.580], colorIdx:0 },
  { ticker:"QIBK", name:"Qatar Islamic Bank",       price:17.653,  prevPrice:17.653,  change:0.030,    changePct:0.17,   volume:3955081, history:[17.4,17.45,17.42,17.5,17.53,17.58,17.52,17.57,17.61,17.64,17.65,17.653], colorIdx:1 },
  { ticker:"QAMC", name:"Qatar Aluminium Manuf.",   price:1.6920,  prevPrice:1.6920,  change:-0.0114,  changePct:-0.671, volume:9452858, history:[1.72,1.715,1.71,1.705,1.708,1.703,1.7,1.698,1.695,1.693,1.692,1.692], colorIdx:2 },
  { ticker:"DHBK", name:"Doha Bank",                price:15.910,  prevPrice:15.910,  change:0.268,    changePct:1.68,   volume:2501265, history:[15.4,15.5,15.55,15.6,15.65,15.7,15.72,15.75,15.8,15.86,15.9,15.91], colorIdx:3 },
  { ticker:"MARK", name:"Masraf Al Rayan",          price:4.231,   prevPrice:4.231,   change:0.033,    changePct:0.79,   volume:1823004, history:[4.1,4.12,4.13,4.15,4.16,4.18,4.19,4.2,4.21,4.22,4.23,4.231], colorIdx:4 },
  { ticker:"BRES", name:"Barwa Real Estate",        price:3.872,   prevPrice:3.872,   change:-0.038,   changePct:-0.97,  volume:4120336, history:[3.95,3.93,3.92,3.91,3.905,3.9,3.895,3.89,3.885,3.88,3.875,3.872], colorIdx:5 },
];

// ─── Ticker tape ──────────────────────────────────────────────────────────────
function TickerTape({ stocks }: { stocks: Stock[] }) {
  const items = [...stocks, ...stocks, ...stocks];
  return (
    <div className="overflow-hidden border-b border-t border-white/[0.06] py-1.5 relative">
      <motion.div className="flex gap-8 whitespace-nowrap"
        animate={{ x: [0, -1 * stocks.length * 200] }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}>
        {items.map((s, i) => {
          const up = s.changePct >= 0;
          return (
            <span key={i} className="flex items-center gap-2 text-[11px] font-medium" style={{ fontFamily: F.mono }}>
              <span className="text-white/40">{s.ticker}</span>
              <span className="text-white/80">{f3(s.price)}</span>
              <span style={{ color: up ? "#cdff00" : "#ff4a4a" }}>{up ? "▲" : "▼"} {f3(Math.abs(s.changePct))}%</span>
            </span>
          );
        })}
      </motion.div>
    </div>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────
function MiniBar({ history, colorIdx, tall }: { history: number[]; colorIdx: number; tall?: boolean }) {
  const c = PALETTE[colorIdx];
  const min = Math.min(...history); const max = Math.max(...history); const rng = max - min || 0.001;
  const days = ["M","T","W","T","F","S","M","T","W","T","F","S"];
  return (
    <div className={`flex items-end gap-[2px] ${tall ? "h-20" : "h-12"}`}>
      {history.map((v, i) => {
        const h = ((v - min) / rng) * 80 + 20;
        const isLast = i === history.length - 1;
        return (
          <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
            <motion.div className="w-full rounded-[2px]"
              initial={{ height: 0 }} animate={{ height: `${h}%` }}
              transition={{ delay: i * 0.04, duration: 0.5, ease: [0.16,1,0.3,1] }}
              style={{ background: isLast ? c.barHi : c.bar }} />
            {tall && <span className="text-[7px]" style={{ color: c.sub, fontFamily: F.mono }}>{days[i]}</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Accordion stock card (the KEY interaction) ───────────────────────────────
function StockCard({ stock, isHovered, isSomeHovered, onClick, isSelected }:
  { stock: Stock; isHovered: boolean; isSomeHovered: boolean; onClick: () => void; isSelected: boolean }) {
  const c = PALETTE[stock.colorIdx];
  const up = stock.changePct >= 0;
  const [priceScope, animatePrice] = useAnimate();

  useEffect(() => {
    animatePrice(priceScope.current, { scale: [1.07, 1] }, { duration: 0.4, ease: [0.16,1,0.3,1] });
  }, [stock.price]);

  return (
    <motion.div onClick={onClick}
      animate={{
        flex: isHovered ? 3.8 : isSomeHovered ? 0.7 : 1,
        opacity: isSomeHovered && !isHovered ? 0.82 : 1,
      }}
      transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-2xl overflow-hidden cursor-pointer flex flex-col"
      style={{ background: c.bg, minWidth: 0, outline: isSelected ? "2.5px solid #111" : "2.5px solid transparent", outlineOffset: "2px" }}
    >
      {/* Always-visible collapsed content */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] block" style={{ color: c.sub, fontFamily: F.body }}>{stock.ticker}</span>

        {/* Vertical ticker name — rotated when collapsed */}
        <motion.div animate={{ opacity: isHovered ? 1 : 0.85 }} className="overflow-hidden">
          <span className={`font-bold leading-tight block ${isHovered ? "text-[15px]" : "text-[12px]"} truncate`}
            style={{ color: c.fg, fontFamily: F.display, transition: "font-size 0.3s" }}>
            {isHovered ? stock.name : stock.ticker}
          </span>
        </motion.div>

        {/* Price — always shown */}
        <div className="mt-auto">
          <span className="text-[8px] font-semibold uppercase tracking-widest block" style={{ color: c.sub, fontFamily: F.body }}>Price</span>
          <span ref={priceScope} className="price-num block font-black leading-none tabular-nums"
            style={{ color: c.fg, fontFamily: F.mono, fontSize: isHovered ? "2rem" : "1.1rem", transition: "font-size 0.3s" }}>
            {f3(stock.price)}
          </span>
        </div>
      </div>

      {/* Expanded content — only visible when hovered */}
      <AnimatePresence>
        {isHovered && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.3, delay: 0.1 }} className="px-3 pb-3 flex flex-col gap-3">
            <MiniBar history={stock.history} colorIdx={stock.colorIdx} tall />
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <span className="text-[8px] font-bold uppercase tracking-widest block" style={{ color: c.sub, fontFamily: F.body }}>Volume</span>
                <span className="text-[13px] font-black tabular-nums" style={{ color: c.fg, fontFamily: F.mono }}>{fv(stock.volume)}</span>
              </div>
              <div>
                <span className="text-[8px] font-bold uppercase tracking-widest block" style={{ color: c.sub, fontFamily: F.body }}>% Change</span>
                <span className="text-[13px] font-black tabular-nums" style={{ color: up ? "#1a4400" : "#6a0000", fontFamily: F.mono }}>
                  {up ? "+" : ""}{f3(stock.changePct)}%
                </span>
              </div>
              <div>
                <span className="text-[8px] font-bold uppercase tracking-widest block" style={{ color: c.sub, fontFamily: F.body }}>Change</span>
                <span className="text-[13px] font-black tabular-nums" style={{ color: up ? "#1a4400" : "#6a0000", fontFamily: F.mono }}>
                  {up ? "+" : ""}{f3(stock.change)}
                </span>
              </div>
              <div>
                <span className="text-[8px] font-bold uppercase tracking-widest block" style={{ color: c.sub, fontFamily: F.body }}>Select</span>
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: c.sub, fontFamily: F.body }}>
                  {isSelected ? "✓ Active" : "Click →"}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thin % change strip at bottom */}
      <div className="h-1 w-full" style={{ background: up ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.12)" }}>
        <motion.div className="h-full"
          animate={{ width: `${Math.min(Math.abs(stock.changePct) * 30, 100)}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ background: up ? "#1a4400" : "#6a0000", opacity: 0.5 }} />
      </div>
    </motion.div>
  );
}

// ─── Custom cursor ────────────────────────────────────────────────────────────
function Cursor() {
  const x = useMotionValue(-100); const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 200, damping: 22 });
  const sy = useSpring(y, { stiffness: 200, damping: 22 });
  useEffect(() => {
    const move = (e: MouseEvent) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);
  return (
    <motion.div className="fixed top-0 left-0 z-[9999] pointer-events-none mix-blend-difference"
      style={{ x: sx, y: sy, translateX: "-50%", translateY: "-50%" }}>
      <div className="w-5 h-5 rounded-full bg-white" />
    </motion.div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
type BV = "buy"|"sell"|"up"|"down"|"open"|"filled"|"partial"|"cancelled"|"neutral";
const BS: Record<BV,string> = {
  buy:"bg-[#cdff0020] text-[#cdff00] border border-[#cdff0035]", sell:"bg-[#ff4a4a20] text-[#ff4a4a] border border-[#ff4a4a35]",
  up:"bg-[#cdff0020] text-[#cdff00] border border-[#cdff0035]", down:"bg-[#ff4a4a20] text-[#ff4a4a] border border-[#ff4a4a35]",
  open:"bg-[#60a5fa20] text-[#60a5fa] border border-[#60a5fa35]", filled:"bg-[#4ade8020] text-[#4ade80] border border-[#4ade8035]",
  partial:"bg-[#facc1520] text-[#facc15] border border-[#facc1535]", cancelled:"bg-white/5 text-white/30 border border-white/10",
  neutral:"bg-white/5 text-white/30 border border-white/10",
};
function Badge({ children, variant="neutral" }: { children: React.ReactNode; variant?: BV }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest ${BS[variant]}`} style={{ fontFamily: F.body }}>{children}</span>;
}

// ─── Btn ──────────────────────────────────────────────────────────────────────
function Btn({ children, onClick, variant="primary", disabled, size="md", full }: {
  children: React.ReactNode; onClick?: () => void; variant?: "primary"|"buy"|"sell"|"ghost"|"outline"; disabled?: boolean; size?: "sm"|"md"|"lg"; full?: boolean;
}) {
  const vs: Record<string,string> = {
    primary:"bg-[#cdff00] text-[#111] hover:bg-[#d9ff33]", buy:"bg-[#cdff00] text-[#111] hover:bg-[#d9ff33]",
    sell:"bg-[#ff4a4a] text-white hover:bg-[#ff6060]", ghost:"bg-transparent text-white/40 hover:text-white hover:bg-white/5",
    outline:"bg-transparent border border-white/10 text-white hover:border-white/25",
  };
  const ss = { sm:"px-3 py-1.5 text-[10px]", md:"px-4 py-2.5 text-[11px]", lg:"px-6 py-3.5 text-xs" };
  return (
    <motion.button onClick={disabled ? undefined : onClick} disabled={disabled}
      whileTap={{ scale: 0.93 }}
      transition={{ type:"spring", stiffness:400, damping:15 }}
      className={`font-bold tracking-widest uppercase rounded-xl transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${ss[size]} ${vs[variant]} ${full ? "w-full" : ""}`}
      style={{ fontFamily: F.body }}>
      {children}
    </motion.button>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
function Input({ label, value, onChange, type="text", placeholder, suffix, error }: {
  label?: string; value: string; onChange: (v:string)=>void; type?: string; placeholder?: string; suffix?: string; error?: string;
}) {
  const [f, setF] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[9px] uppercase tracking-[0.16em] font-bold text-white/30" style={{ fontFamily:F.body }}>{label}</label>}
      <div className={`flex items-center bg-white/[0.04] rounded-xl border transition-all duration-200 ${f ? "border-[#cdff00] shadow-[0_0_0_2px_rgba(205,255,0,0.07)]" : error ? "border-[#ff4a4a]/40" : "border-white/[0.07]"}`}>
        <input type={type} value={value} onChange={e=>onChange(e.target.value)} onFocus={()=>setF(true)} onBlur={()=>setF(false)}
          placeholder={placeholder}
          className="flex-1 bg-transparent py-2.5 px-3 text-sm text-white outline-none placeholder-white/20"
          style={{ fontFamily:F.mono }} />
        {suffix && <span className="pr-3 text-[10px] text-white/25 font-semibold" style={{ fontFamily:F.body }}>{suffix}</span>}
      </div>
      {error && <span className="text-[10px] text-[#ff4a4a]" style={{ fontFamily:F.body }}>{error}</span>}
    </div>
  );
}

// ─── ErrorAlert ───────────────────────────────────────────────────────────────
function ErrAlert({ msg, onClose }: { msg: string; onClose: ()=>void }) {
  return (
    <AnimatePresence>
      {msg && (
        <motion.div initial={{ opacity:0, y:-6, scale:0.97 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0 }}
          className="flex items-start gap-2 p-3 rounded-xl bg-[#ff4a4a]/10 border border-[#ff4a4a]/20">
          <AlertCircle size={13} className="text-[#ff4a4a] mt-0.5 shrink-0" />
          <span className="text-[11px] text-[#ff4a4a] flex-1" style={{ fontFamily:F.body }}>{msg}</span>
          <button onClick={onClose} className="text-[#ff4a4a]/50 hover:text-[#ff4a4a]"><X size={11}/></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }: { open:boolean; onClose:()=>void; title:string; children:React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
          onClick={e => { if (e.currentTarget === e.target) onClose(); }}>
          <motion.div initial={{ y:32, opacity:0, scale:0.95 }} animate={{ y:0, opacity:1, scale:1 }} exit={{ y:16, opacity:0, scale:0.97 }}
            transition={{ duration:0.38, ease:[0.16,1,0.3,1] }}
            className="bg-[#161616] border border-white/[0.09] rounded-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
              <h3 className="text-sm font-bold uppercase tracking-widest text-white" style={{ fontFamily:F.display }}>{title}</h3>
              <button onClick={onClose} className="text-white/30 hover:text-white"><X size={15}/></button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────
function Loading({ size=14 }: { size?: number }) {
  return <motion.div animate={{ rotate:360 }} transition={{ duration:0.7, repeat:Infinity, ease:"linear" }}><RefreshCw size={size} className="text-[#cdff00]"/></motion.div>;
}

// ─── Sortable table ───────────────────────────────────────────────────────────
type SD = "asc"|"desc"|null;
interface Col<T> { key:string; label:string; sortable?:boolean; align?:"left"|"right"|"center"; render?:(r:T)=>React.ReactNode }
function DTable<T>({ cols, rows, pageSize=7 }: { cols:Col<T>[]; rows:T[]; pageSize?:number }) {
  const [sk,setSk] = useState<string|null>(null); const [sd,setSd] = useState<SD>(null); const [pg,setPg] = useState(0);
  const sorted = useMemo(() => {
    if (!sk||!sd) return rows;
    return [...rows].sort((a,b) => {
      const av=(a as Record<string,unknown>)[sk], bv=(b as Record<string,unknown>)[sk];
      const c = typeof av==="number"&&typeof bv==="number" ? av-bv : String(av??"").localeCompare(String(bv??""));
      return sd==="asc"?c:-c;
    });
  }, [rows,sk,sd]);
  const pages = Math.max(1, Math.ceil(sorted.length/pageSize));
  const slice = sorted.slice(pg*pageSize, (pg+1)*pageSize);
  const sort = (k:string) => { if (sk!==k){setSk(k);setSd("asc");}else if(sd==="asc")setSd("desc");else{setSk(null);setSd(null);}setPg(0); };
  return (
    <div>
      <div className="rounded-xl overflow-hidden border border-white/[0.06]">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              {cols.map(c => (
                <th key={c.key} onClick={()=>c.sortable&&sort(c.key)}
                  className={`px-3 py-2.5 text-[9px] uppercase tracking-[0.12em] text-white/25 font-bold text-${c.align||"left"} ${c.sortable?"cursor-pointer hover:text-white select-none":""}`}
                  style={{ fontFamily:F.body }}>
                  <div className={`flex items-center gap-1 ${c.align==="right"?"justify-end":""}`}>
                    {c.label}
                    {c.sortable && (sk===c.key ? (sd==="asc"?<ChevronUp size={10} className="text-[#cdff00]"/>:<ChevronDown size={10} className="text-[#cdff00]"/>) : <ChevronsUpDown size={10} className="text-white/15"/>)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {slice.map((row,i) => (
                <motion.tr key={i} initial={{ opacity:0,x:-6 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0 }} transition={{ delay:i*0.025 }}
                  className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
                  {cols.map(c => (
                    <td key={c.key} className={`px-3 py-2.5 text-${c.align||"left"} text-white/60`} style={{ fontFamily:F.mono }}>
                      {c.render?c.render(row):String((row as Record<string,unknown>)[c.key]??"")}
                    </td>
                  ))}
                </motion.tr>
              ))}
            </AnimatePresence>
            {!slice.length && <tr><td colSpan={cols.length} className="px-3 py-10 text-center text-white/15 text-xs" style={{ fontFamily:F.body }}>No data</td></tr>}
          </tbody>
        </table>
      </div>
      {pages>1&&(
        <div className="flex items-center justify-between mt-3">
          <span className="text-[9px] text-white/20" style={{ fontFamily:F.body }}>Page {pg+1}/{pages}</span>
          <div className="flex gap-1">
            {Array.from({length:pages},(_,i)=>(
              <button key={i} onClick={()=>setPg(i)}
                className={`w-5 h-5 rounded text-[9px] font-bold ${i===pg?"bg-[#cdff00] text-[#111]":"bg-white/[0.06] text-white/30 hover:text-white"}`}
                style={{ fontFamily:F.body }}>{i+1}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Order Book ───────────────────────────────────────────────────────────────
function BookPanel({ ticker, stocks }: { ticker:string; stocks:Stock[] }) {
  const { bids, asks } = engine.book(ticker);
  const s = stocks.find(x=>x.ticker===ticker);
  const up = s ? s.changePct >= 0 : true;
  const mB = Math.max(...bids.map(b=>b.quantity-b.filled),1);
  const mA = Math.max(...asks.map(a=>a.quantity-a.filled),1);
  return (
    <div className="bg-[#111] rounded-2xl border border-white/[0.07] p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen size={12} className="text-[#cdff00]"/>
        <span className="text-[9px] uppercase tracking-widest font-bold text-white/30" style={{ fontFamily:F.body }}>Order Book</span>
        <span className="ml-auto text-[9px] text-white/20 font-bold" style={{ fontFamily:F.body }}>{ticker}</span>
      </div>
      <div className="grid grid-cols-3 text-[8px] uppercase tracking-widest text-white/20 mb-1.5 px-1 font-bold" style={{ fontFamily:F.body }}>
        <span>Price</span><span className="text-center">Size</span><span className="text-right">Total</span>
      </div>
      {asks.slice().reverse().map(a => {
        const rem=a.quantity-a.filled;
        return (
          <div key={a.id} className="relative grid grid-cols-3 text-[10px] py-0.5 px-1 rounded" style={{ fontFamily:F.mono }}>
            <div className="absolute inset-y-0 right-0 rounded" style={{ width:`${(rem/mA)*100}%`, background:"rgba(255,74,74,0.09)" }}/>
            <span className="text-[#ff6a6a] z-10">{f3(a.price)}</span>
            <span className="text-center text-white/40 z-10">{rem}</span>
            <span className="text-right text-white/20 z-10">{Math.round(a.price*rem)}</span>
          </div>
        );
      })}
      <div className="my-2 py-2 border-y border-white/[0.06] flex items-center justify-between px-1">
        <span className="text-xs font-black tabular-nums text-white" style={{ fontFamily:F.mono }}>{s?f3(s.price):"—"}</span>
        <span className="text-[9px] font-bold" style={{ color:up?"#cdff00":"#ff4a4a", fontFamily:F.body }}>{s?`${up?"▲":"▼"} ${f3(Math.abs(s.changePct))}%`:""}</span>
      </div>
      {bids.map(b => {
        const rem=b.quantity-b.filled;
        return (
          <div key={b.id} className="relative grid grid-cols-3 text-[10px] py-0.5 px-1 rounded" style={{ fontFamily:F.mono }}>
            <div className="absolute inset-y-0 right-0 rounded" style={{ width:`${(rem/mB)*100}%`, background:"rgba(205,255,0,0.07)" }}/>
            <span className="text-[#cdff00] z-10">{f3(b.price)}</span>
            <span className="text-center text-white/40 z-10">{rem}</span>
            <span className="text-right text-white/20 z-10">{Math.round(b.price*rem)}</span>
          </div>
        );
      })}
      {!bids.length&&!asks.length&&(
        <div className="flex-1 flex items-center justify-center text-white/10 text-xs mt-4" style={{ fontFamily:F.body }}>No open orders</div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [stocks, setStocks] = useState<Stock[]>(STOCKS);
  const [hoveredTicker, setHoveredTicker] = useState<string|null>(null);
  const [sel, setSel] = useState("QNBK");
  const [tab, setTab] = useState<"order"|"portfolio"|"history">("order");
  const [side, setSide] = useState<Side>("BUY");
  const [otype, setOtype] = useState<OType>("LIMIT");
  const [priceIn, setPriceIn] = useState("");
  const [qtyIn, setQtyIn] = useState("");
  const [err, setErr] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [portfolio, setPortfolio] = useState<Position[]>([]);
  const [cash, setCash] = useState(100000);
  const [toast, setToast] = useState<{ msg:string; ok:boolean }|null>(null);
  const [confirmO, setConfirmO] = useState<Order|null>(null);
  const [bookKey, setBookKey] = useState(0);

  const stock = stocks.find(s=>s.ticker===sel)!;
  const openOrders = orders.filter(o=>o.status==="OPEN"||o.status==="PARTIAL");
  const livePortfolio = portfolio.map(p=>({ ...p, currentPrice: stocks.find(s=>s.ticker===p.ticker)?.price??p.currentPrice }));

  // Live prices
  useEffect(() => {
    const iv = setInterval(() => {
      setStocks(prev=>prev.map(s=>{
        const drift=(Math.random()-0.49)*0.0018*s.price;
        const p=Math.max(s.price+drift,0.01);
        const base=STOCKS.find(x=>x.ticker===s.ticker)!;
        return { ...s, prevPrice:s.price, price:p, change:p-base.price, changePct:((p-base.price)/base.price)*100, volume:s.volume+Math.floor(Math.random()*300), history:[...s.history.slice(-11),p] };
      }));
    }, 1400);
    return ()=>clearInterval(iv);
  }, []);

  // Entry animations handled via motion variants on each element

  const showToast=(msg:string,ok:boolean)=>{ setToast({msg,ok}); setTimeout(()=>setToast(null),3200); };

  const validate=():boolean=>{
    const qty=parseInt(qtyIn), price=parseFloat(priceIn);
    if (!qtyIn||isNaN(qty)||qty<=0){setErr("Enter a valid quantity");return false;}
    if (otype==="LIMIT"&&(!priceIn||isNaN(price)||price<=0)){setErr("Enter a valid limit price");return false;}
    if (side==="BUY"){
      const cost=(otype==="MARKET"?stock.price:price)*qty;
      if (cost>cash){setErr(`Need ${f2(cost)} QAR — have ${f2(cash)}`);return false;}
    } else {
      const pos=portfolio.find(p=>p.ticker===sel);
      if (!pos||pos.quantity<qty){setErr(`Only ${pos?.quantity??0} shares held`);return false;}
    }
    setErr(""); return true;
  };

  const doOrder=useCallback(()=>{
    const qty=parseInt(qtyIn), price=otype==="MARKET"?stock.price:parseFloat(priceIn);
    const order:Order={ id:uid(), ticker:sel, side, type:otype, price, quantity:qty, filled:0, status:"OPEN", timestamp:Date.now() };
    const ts=engine.place(order);
    if (ts.length){
      const tQ=ts.reduce((s,t)=>s+t.quantity,0), tC=ts.reduce((s,t)=>s+t.price*t.quantity,0);
      setPortfolio(prev=>{
        const idx=prev.findIndex(p=>p.ticker===sel);
        if (side==="BUY"){
          if (idx>=0){const u=[...prev],p=u[idx],nq=p.quantity+tQ;u[idx]={...p,quantity:nq,avgCost:(p.avgCost*p.quantity+tC)/nq,currentPrice:stock.price};return u;}
          return [...prev,{ticker:sel,quantity:tQ,avgCost:tC/tQ,currentPrice:stock.price}];
        } else {
          if (idx>=0){const u=[...prev],nq=u[idx].quantity-tQ;if(nq<=0)u.splice(idx,1);else u[idx]={...u[idx],quantity:nq};return u;}
          return prev;
        }
      });
      setCash(c=>side==="BUY"?c-tC:c+tC);
      setTrades(t=>[...ts,...t]);
    }
    setOrders(o=>[order,...o]); setBookKey(k=>k+1); setConfirmO(null); setPriceIn(""); setQtyIn("");
    showToast(order.status==="FILLED"?`✓ ${side} ${qty} ${sel} — FILLED`:ts.length?`${side} ${order.filled}/${qty} — PARTIAL`:`${side} order in book`, order.status==="FILLED"||ts.length>0);
  }, [qtyIn,priceIn,otype,sel,side,stock.price]);

  const handlePlace=()=>{ if(!validate())return; setConfirmO({id:uid(),ticker:sel,side,type:otype,price:otype==="MARKET"?stock.price:parseFloat(priceIn),quantity:parseInt(qtyIn),filled:0,status:"OPEN",timestamp:Date.now()}); };
  const cancelOrder=(id:string)=>{ engine.cancel(id); setOrders(o=>o.map(x=>x.id===id?{...x,status:"CANCELLED"}:x)); setBookKey(k=>k+1); showToast("Order cancelled",false); };

  return (
    <div className="min-h-screen bg-[#111] text-white cursor-none" style={{ fontFamily:F.body }}>
      <Cursor />

      {/* Toast */}
      <AnimatePresence>
        {toast&&(
          <motion.div initial={{ opacity:0,y:-20,x:"-50%" }} animate={{ opacity:1,y:0,x:"-50%" }} exit={{ opacity:0,y:-16,x:"-50%" }}
            className="fixed top-5 left-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-full shadow-2xl text-sm font-bold"
            style={{ background:toast.ok?"#cdff00":"#1e1e1e", color:toast.ok?"#111":"#f2f2f2", border:toast.ok?"none":"1px solid rgba(255,255,255,0.09)", fontFamily:F.body }}>
            {toast.ok?<CheckCircle2 size={14}/>:<X size={14}/>}{toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Modal */}
      <Modal open={!!confirmO} onClose={()=>setConfirmO(null)} title="Confirm Order">
        {confirmO&&(
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              {([["Ticker",confirmO.ticker],["Side",<Badge variant={confirmO.side==="BUY"?"buy":"sell"}>{confirmO.side}</Badge>],
                ["Type",confirmO.type],["Price",f3(confirmO.price)+" QAR"],
                ["Qty",confirmO.quantity],["Est. Total",f2(confirmO.price*confirmO.quantity)+" QAR"]
              ] as [string,React.ReactNode][]).map(([l,v])=>(
                <div key={String(l)} className="flex flex-col gap-0.5">
                  <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold" style={{ fontFamily:F.body }}>{l}</span>
                  <span className="text-sm font-bold text-white" style={{ fontFamily:F.mono }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-1">
              <Btn variant="ghost" onClick={()=>setConfirmO(null)} full>Cancel</Btn>
              <Btn variant={confirmO.side==="BUY"?"buy":"sell"} onClick={doOrder} size="lg" full>Confirm {confirmO.side}</Btn>
            </div>
          </div>
        )}
      </Modal>

      <div className="max-w-[1440px] mx-auto px-6 py-6 flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <motion.h1 initial={{ y:-28, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ duration:0.65, ease:[0.16,1,0.3,1] }}
              className="text-[2.6rem] font-black tracking-tight leading-none text-white" style={{ fontFamily:F.display }}>
              Your portfolios
            </motion.h1>
            <motion.p initial={{ y:-12, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ duration:0.6, delay:0.1, ease:[0.16,1,0.3,1] }}
              className="text-sm text-white/30 mt-1.5" style={{ fontFamily:F.body }}>Top movers on your lists</motion.p>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#cdff00] opacity-75"/><span className="relative inline-flex rounded-full h-2 w-2 bg-[#cdff00]"/></span>
              <span className="text-[9px] uppercase tracking-widest text-[#cdff00] font-bold" style={{ fontFamily:F.body }}>Live</span>
            </div>
            <div className="text-right">
              <span className="text-[9px] uppercase tracking-widest text-white/20 font-bold block" style={{ fontFamily:F.body }}>Cash</span>
              <span className="text-lg font-black text-[#cdff00] tabular-nums" style={{ fontFamily:F.mono }}>{f2(cash)} QAR</span>
            </div>
          </div>
        </div>

        {/* Ticker tape */}
        <TickerTape stocks={stocks}/>

        {/* Accordion stock cards */}
        <motion.div initial={{ y:22, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ duration:0.65, delay:0.18, ease:[0.16,1,0.3,1] }}
          className="flex gap-2.5 h-[280px]"
          onMouseLeave={()=>setHoveredTicker(null)}>
          {stocks.map(s=>(
            <div key={s.ticker} style={{ flex:1, minWidth:0, display:"flex" }}
              onMouseEnter={()=>setHoveredTicker(s.ticker)}>
              <StockCard stock={s}
                isHovered={hoveredTicker===s.ticker}
                isSomeHovered={hoveredTicker!==null}
                isSelected={sel===s.ticker}
                onClick={()=>setSel(s.ticker)}/>
            </div>
          ))}
        </motion.div>

        {/* Exchange panels */}
        <motion.div initial={{ y:18, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ duration:0.65, delay:0.4, ease:[0.16,1,0.3,1] }}
          className="grid grid-cols-1 lg:grid-cols-[1fr_260px_220px] gap-4">

          {/* Left: tabs */}
          <div className="flex flex-col gap-4">
            <div className="flex border-b border-white/[0.07]">
              {([{k:"order" as const,icon:<Zap size={10}/>,l:"Place Order"},{k:"portfolio" as const,icon:<Wallet size={10}/>,l:"Portfolio"},{k:"history" as const,icon:<Clock size={10}/>,l:"History"}]).map(t=>(
                <button key={t.k} onClick={()=>setTab(t.k)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all duration-200 ${tab===t.k?"border-[#cdff00] text-[#cdff00]":"border-transparent text-white/25 hover:text-white/60"}`}
                  style={{ fontFamily:F.body }}>
                  {t.icon}{t.l}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">

              {tab==="order"&&(
                <motion.div key="order" initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }} className="flex flex-col gap-4">
                  {/* Selected stock summary */}
                  <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <span className="text-[9px] uppercase tracking-[0.2em] text-white/25 font-bold block" style={{ fontFamily:F.body }}>{stock.ticker}</span>
                        <h2 className="text-xl font-black mt-0.5 text-white" style={{ fontFamily:F.display }}>{stock.name}</h2>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="text-4xl font-black tabular-nums text-white leading-none" style={{ fontFamily:F.mono }}>{f3(stock.price)}</span>
                        <Badge variant={stock.changePct>=0?"up":"down"}>{stock.changePct>=0?"+":""}{f3(stock.changePct)}%</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/[0.05]">
                      {[["Volume",fv(stock.volume)],["Change",(stock.change>=0?"+":"")+f3(stock.change)],["Holdings",portfolio.find(p=>p.ticker===sel)?.quantity??0]].map(([l,v])=>(
                        <div key={String(l)}>
                          <span className="text-[9px] uppercase tracking-widest text-white/20 font-bold block" style={{ fontFamily:F.body }}>{l}</span>
                          <span className="text-sm font-black text-white tabular-nums" style={{ fontFamily:F.mono }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Order form */}
                  <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold" style={{ fontFamily:F.body }}>New Order</span>
                      <div className="flex gap-1">
                        {(["LIMIT","MARKET"] as OType[]).map(t=>(
                          <button key={t} onClick={()=>setOtype(t)}
                            className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all ${otype===t?"bg-[#cdff00] text-[#111]":"bg-white/[0.05] text-white/30 hover:text-white"}`}
                            style={{ fontFamily:F.body }}>{t}</button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["BUY","SELL"] as Side[]).map(s=>(
                        <motion.button key={s} onClick={()=>setSide(s)} whileTap={{ scale:0.95 }}
                          className={`py-3.5 text-xs font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-1.5 transition-all duration-200 ${side===s?(s==="BUY"?"bg-[#cdff00] text-[#111]":"bg-[#ff4a4a] text-white"):"bg-white/[0.04] text-white/25 border border-white/[0.06] hover:text-white/60"}`}
                          style={{ fontFamily:F.body }}>
                          {s==="BUY"?<TrendingUp size={13}/>:<TrendingDown size={13}/>}{s}
                        </motion.button>
                      ))}
                    </div>
                    {otype==="LIMIT"&&<Input label="Limit Price" value={priceIn} onChange={v=>{setPriceIn(v);setErr("");}} type="number" placeholder="0.000" suffix="QAR"/>}
                    {otype==="MARKET"&&(
                      <div className="flex items-center gap-2 px-3 py-3 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                        <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold" style={{ fontFamily:F.body }}>Market Price</span>
                        <span className="ml-auto text-sm font-black text-[#cdff00] tabular-nums" style={{ fontFamily:F.mono }}>{f3(stock.price)}</span>
                      </div>
                    )}
                    <Input label="Quantity (shares)" value={qtyIn} onChange={v=>{setQtyIn(v);setErr("");}} type="number" placeholder="0"/>
                    {qtyIn&&(
                      <div className="flex items-center justify-between px-3 py-2.5 bg-white/[0.02] rounded-xl border border-white/[0.05]">
                        <span className="text-[9px] uppercase tracking-widest text-white/20 font-bold" style={{ fontFamily:F.body }}>Est. Total</span>
                        <span className="text-sm font-black tabular-nums text-white" style={{ fontFamily:F.mono }}>
                          {f2((otype==="MARKET"?stock.price:(parseFloat(priceIn)||0))*(parseInt(qtyIn)||0))} QAR
                        </span>
                      </div>
                    )}
                    <ErrAlert msg={err} onClose={()=>setErr("")}/>
                    <Btn variant={side==="BUY"?"buy":"sell"} onClick={handlePlace} size="lg" full>
                      {side==="BUY"?<TrendingUp size={13} className="inline mr-1.5"/>:<TrendingDown size={13} className="inline mr-1.5"/>}
                      Place {side} Order
                    </Btn>
                  </div>

                  {/* Open orders */}
                  {openOrders.length>0&&(
                    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart2 size={12} className="text-[#cdff00]"/>
                        <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold" style={{ fontFamily:F.body }}>Open</span>
                        <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#cdff00]/10 text-[#cdff00]" style={{ fontFamily:F.body }}>{openOrders.length}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <AnimatePresence>
                          {openOrders.map(o=>(
                            <motion.div key={o.id} layout initial={{ opacity:0,x:-8 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0 }}
                              className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                              <Badge variant={o.side==="BUY"?"buy":"sell"}>{o.side}</Badge>
                              <span className="text-[10px] font-bold text-white/40" style={{ fontFamily:F.body }}>{o.ticker}</span>
                              <span className="text-[10px] font-semibold text-white/60 tabular-nums" style={{ fontFamily:F.mono }}>{o.filled}/{o.quantity}</span>
                              <span className="text-[10px] text-white/30 ml-auto tabular-nums" style={{ fontFamily:F.mono }}>{f3(o.price)}</span>
                              <button onClick={()=>cancelOrder(o.id)} className="text-white/20 hover:text-[#ff4a4a] transition-colors"><X size={11}/></button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {tab==="portfolio"&&(
                <motion.div key="portfolio" initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }}
                  className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Wallet size={12} className="text-[#cdff00]"/>
                    <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold" style={{ fontFamily:F.body }}>Holdings</span>
                  </div>
                  <DTable<Position&{pnl:number}>
                    rows={livePortfolio.map(p=>({...p,pnl:(p.currentPrice-p.avgCost)*p.quantity}))}
                    pageSize={7}
                    cols={[
                      {key:"ticker",label:"Ticker",sortable:true},
                      {key:"quantity",label:"Qty",sortable:true,align:"right"},
                      {key:"avgCost",label:"Avg",sortable:true,align:"right",render:r=>f3(r.avgCost)},
                      {key:"currentPrice",label:"Price",sortable:true,align:"right",render:r=><span style={{ color:r.currentPrice>=r.avgCost?"#cdff00":"#ff4a4a" }}>{f3(r.currentPrice)}</span>},
                      {key:"pnl",label:"P&L",sortable:true,align:"right",render:r=><span style={{ color:r.pnl>=0?"#cdff00":"#ff4a4a" }}>{r.pnl>=0?"+":""}{f2(r.pnl)}</span>},
                    ]}
                  />
                  {!livePortfolio.length&&<div className="text-center py-12 text-white/10 text-sm" style={{ fontFamily:F.body }}>No positions yet</div>}
                </motion.div>
              )}

              {tab==="history"&&(
                <motion.div key="history" initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }}
                  className="bg-white/[0.03] rounded-2xl border border-white/[0.07] p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock size={12} className="text-[#cdff00]"/>
                    <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold" style={{ fontFamily:F.body }}>Transaction History</span>
                  </div>
                  <DTable<Trade>
                    rows={trades}
                    pageSize={8}
                    cols={[
                      {key:"ticker",label:"Ticker",sortable:true},
                      {key:"side",label:"Side",render:t=><Badge variant={t.side==="BUY"?"buy":"sell"}>{t.side}</Badge>},
                      {key:"price",label:"Price",sortable:true,align:"right",render:t=>f3(t.price)},
                      {key:"quantity",label:"Qty",sortable:true,align:"right"},
                      {key:"total",label:"Total",align:"right",render:t=>f2(t.price*t.quantity)},
                      {key:"timestamp",label:"Time",sortable:true,align:"right",render:t=>new Date(t.timestamp).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"})},
                    ]}
                  />
                  {!trades.length&&<div className="text-center py-12 text-white/10 text-sm" style={{ fontFamily:F.body }}>No trades yet</div>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Order Book */}
          <div key={bookKey}><BookPanel ticker={sel} stocks={stocks}/></div>

          {/* Orders log */}
          <div className="bg-[#111] rounded-2xl border border-white/[0.07] p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={12} className="text-[#cdff00]"/>
              <span className="text-[9px] uppercase tracking-widest text-white/25 font-bold" style={{ fontFamily:F.body }}>Orders</span>
              <span className="ml-auto text-[9px] text-white/15 tabular-nums" style={{ fontFamily:F.mono }}>{orders.length}</span>
            </div>
            <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 max-h-[580px]">
              <AnimatePresence>
                {orders.slice(0,40).map(o=>(
                  <motion.div key={o.id} initial={{ opacity:0,y:-6 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0 }}
                    className="flex flex-col gap-1 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant={o.side==="BUY"?"buy":"sell"}>{o.side}</Badge>
                      <span className="text-[9px] font-bold text-white/30" style={{ fontFamily:F.body }}>{o.ticker}</span>
                      <Badge variant={o.status.toLowerCase() as BV}>{o.status}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-white/25 tabular-nums" style={{ fontFamily:F.mono }}>{f3(o.price)} × {o.quantity}</span>
                      <span className="text-[8px] text-white/15" style={{ fontFamily:F.body }}>{o.type}</span>
                    </div>
                    {(o.status==="OPEN"||o.status==="PARTIAL")&&(
                      <button onClick={()=>cancelOrder(o.id)} className="text-[8px] text-white/20 hover:text-[#ff4a4a] transition-colors text-left" style={{ fontFamily:F.body }}>
                        Cancel →
                      </button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {!orders.length&&<div className="flex-1 flex items-center justify-center text-white/10 text-xs" style={{ fontFamily:F.body }}>No orders</div>}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
