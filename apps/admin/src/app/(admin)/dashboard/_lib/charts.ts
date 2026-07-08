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
  info: dsColors.info[500]!,
  infoLight: dsColors.info[100]!,
  success: dsColors.success[500]!,
  warning: dsColors.warning[500]!,
  danger: dsColors.danger[500]!,
  subtle: dsColors.text.subtle,
  grid: 'rgba(255,255,255,0.1)',
};

/** Wide palette so each category slice gets a distinct color. */
export const categoryColors = [
  dsColors.primary[500]!,
  dsColors.info[500]!,
  dsColors.success[500]!,
  dsColors.warning[500]!,
  dsColors.danger[500]!,
  dsColors.primary[700]!,
  dsColors.info[700]!,
  dsColors.success[700]!,
  dsColors.warning[700]!,
  dsColors.danger[700]!,
];

export function generate30DayLabels() {
  const labels: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    labels.push(date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }));
  }
  return labels;
}
