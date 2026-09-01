interface TokenMeterProps {
  tokens: number;
  budget: number;
  method: string;
}

export default function TokenMeter({ tokens, budget, method }: TokenMeterProps) {
  const pct = budget > 0 ? (tokens / budget) * 100 : 0;
  const level = pct < 70 ? "green" : pct <= 100 ? "amber" : "red";
  const width = Math.min(pct, 100);

  return (
    <div className="token-meter">
      <div className="token-meter-bar">
        <div className={`token-meter-fill ${level}`} style={{ width: `${width}%` }} />
      </div>
      <div className="token-meter-label">
        {tokens} / {budget} tok ({method})
      </div>
    </div>
  );
}
