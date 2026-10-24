import { encouragement } from "../lib/domain";

export function MilkTeaCup({
  progress,
  current,
  target,
  label,
}: {
  progress: number;
  current: number;
  target: number;
  label: string;
}) {
  const safeProgress = Math.min(100, Math.max(0, progress));
  const liquidY = 224 - safeProgress * 1.52;
  const liquidHeight = (152 * safeProgress) / 100;
  return (
    <section
      className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-peach-100 via-cream-50 to-mint-100 p-6 md:p-8"
      aria-label={`Tiến độ mục tiêu ${Math.round(safeProgress)} phần trăm`}
    >
      <div className="soft-grid absolute inset-0 opacity-40" />
      <div className="relative grid items-center gap-6 md:grid-cols-[minmax(220px,320px)_1fr]">
        <div className="mx-auto w-full max-w-[290px]">
          <svg
            viewBox="0 0 300 300"
            className="w-full drop-shadow-[0_22px_18px_rgba(79,50,32,0.18)]"
            role="img"
            aria-label={`Cốc trà sữa đã đầy ${Math.round(safeProgress)}%`}
          >
            <defs>
              <clipPath id="cup-clip">
                <path d="M65 68h172l-18 190a18 18 0 0 1-18 16H99a18 18 0 0 1-18-16z" />
              </clipPath>
              <linearGradient id="tea-liquid" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#d8aa7b" />
                <stop offset="1" stopColor="#a9714c" />
              </linearGradient>
            </defs>
            <path
              d="M180 18h16l-39 160h-16z"
              fill="#84bda7"
              stroke="#fffaf4"
              strokeWidth="5"
            />
            <g clipPath="url(#cup-clip)">
              <rect
                x="64"
                y={liquidY}
                width="176"
                height={liquidHeight + 52}
                rx="18"
                fill="url(#tea-liquid)"
                className="transition-all duration-1000 ease-out"
              />
              <path
                d={`M56 ${liquidY + 4} Q98 ${liquidY - 7} 145 ${liquidY + 3} T245 ${liquidY}`}
                fill="none"
                stroke="#efd1af"
                strokeWidth="8"
                strokeLinecap="round"
                className="liquid-wave transition-all duration-1000"
              />
              {[104, 132, 160, 190, 118, 151, 181].map((cx, index) => (
                <circle
                  key={cx + index}
                  className="pearl"
                  cx={cx}
                  cy={244 + (index % 2) * 10}
                  r="11"
                  fill="#4b2d23"
                />
              ))}
            </g>
            <path
              d="M65 68h172l-18 190a18 18 0 0 1-18 16H99a18 18 0 0 1-18-16z"
              fill="rgba(255,255,255,.12)"
              stroke="rgba(255,255,255,.86)"
              strokeWidth="7"
            />
            <rect
              x="91"
              y="133"
              width="118"
              height="57"
              rx="20"
              fill="#fff8ee"
              opacity=".94"
            />
            <text
              x="150"
              y="155"
              textAnchor="middle"
              fontSize="11"
              fontWeight="800"
              fill="#6f4731"
            >
              MATH &amp;
            </text>
            <text
              x="150"
              y="174"
              textAnchor="middle"
              fontSize="14"
              fontWeight="900"
              fill="#6f4731"
            >
              MILK TEA
            </text>
          </svg>
        </div>
        <div>
          <p className="eyebrow">Mục tiêu của em</p>
          <h2 className="mt-2 text-2xl font-black md:text-3xl">{label}</h2>
          <p className="mt-2 text-tea-500">{encouragement(safeProgress)}</p>
          <div className="mt-6 flex items-end gap-3">
            <strong className="text-5xl font-black tracking-tight text-tea-700">
              {Math.round(safeProgress)}%
            </strong>
            <span className="pb-1 text-sm font-bold text-tea-500">
              đã hoàn thành
            </span>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/80">
            <div
              className="h-full rounded-full bg-mint-500 transition-[width] duration-1000"
              style={{ width: `${safeProgress}%` }}
            />
          </div>
          <div className="mt-3 flex justify-between text-sm font-bold">
            <span>{current} điểm</span>
            <span>Mục tiêu {target} điểm</span>
          </div>
        </div>
      </div>
    </section>
  );
}
