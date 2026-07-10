import { Dimensions } from 'react-native';
import { CONDITION_OPTIONS } from '../../../src/utils/productFilters';

const { width } = Dimensions.get('window');

export const CARD_WIDTH = (width - 48) / 2;
export const PAGE_SIZE = 24;

// Üst çubuklar (arama + filtre) için tahmini başlangıç yüksekliği; gerçek değer onLayout ile ölçülür.
export const COLLAPSIBLE_ESTIMATE = 180;

export const conditionLabel = (v: string) =>
  CONDITION_OPTIONS.find((c) => c.value === v)?.label || v;
