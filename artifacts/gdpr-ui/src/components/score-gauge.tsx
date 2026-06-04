import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from "recharts";

function scoreColor(score: number) {
  if (score >= 70) return "#f97583";
  if (score >= 40) return "#e3b341";
  return "#3fb950";
}

export function ScoreGauge({ score }: { score: number }) {
  const color = scoreColor(score);
  const data = [{ value: score, fill: color }];

  return (
    <div className="relative flex flex-col items-center justify-center">
      <ResponsiveContainer width={160} height={160}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius={52}
          outerRadius={72}
          barSize={12}
          data={data}
          startAngle={225}
          endAngle={-45}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar background={{ fill: "#21262d" }} dataKey="value" angleAxisId={0} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>
          {score}
        </span>
        <span className="text-[10px] text-[#8b949e] uppercase tracking-widest mt-0.5">
          Risk Score
        </span>
      </div>
    </div>
  );
}
