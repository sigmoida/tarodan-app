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
} from 'chart.js';
import { colors as dsColors } from '@tarodan/ui';

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
  grid: 'rgba(255,255,255,0.1)',
};

export const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: chartPalette.grid }, ticks: { color: chartPalette.subtle } },
    y: { grid: { color: chartPalette.grid }, ticks: { color: chartPalette.subtle } },
  },
};
