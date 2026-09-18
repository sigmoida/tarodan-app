import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from "chart.js";
import { colors as dsColors } from "@tarodan/ui";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

export const chartPalette = {
  primary: dsColors.primary[500]!,
  primaryLight: dsColors.primary[100]!,
  primaryDark: dsColors.primary[700]!,
  info: dsColors.info[500]!,
  infoLight: dsColors.info[100]!,
  success: dsColors.success[500]!,
  warning: dsColors.warning[500]!,
  danger: dsColors.danger[500]!,
  subtle: dsColors.text.subtle,
  // The panel is light-only. The grid used to be `rgba(255,255,255,0.1)` —
  // white on white, i.e. no grid at all on every chart in the panel.
  grid: "rgba(15, 23, 42, 0.08)",
};

/**
 * Series colour by position, so a chart with three lines does not draw them in
 * the same colour. Cycles rather than running out.
 */
const SERIES_COLORS = [
  chartPalette.primary,
  chartPalette.info,
  chartPalette.warning,
  chartPalette.success,
  chartPalette.danger,
];

export const seriesColor = (index: number): string =>
  SERIES_COLORS[index % SERIES_COLORS.length]!;

export const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index" as const, intersect: false },
  plugins: { legend: { display: false } },
  scales: {
    x: {
      grid: { color: chartPalette.grid },
      ticks: { color: chartPalette.subtle, maxRotation: 0, autoSkip: true },
    },
    y: {
      beginAtZero: true,
      grid: { color: chartPalette.grid },
      ticks: { color: chartPalette.subtle },
    },
  },
};
