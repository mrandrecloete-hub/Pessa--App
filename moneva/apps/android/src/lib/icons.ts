import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Ionicons>['name'];

const MAP: Record<string, IconName> = {
  housing: 'home-outline',
  groceries: 'cart-outline',
  transport: 'bus-outline',
  fuel: 'car-outline',
  electricity: 'flash-outline',
  water: 'water-outline',
  internet: 'wifi-outline',
  mobile: 'phone-portrait-outline',
  healthcare: 'medkit-outline',
  education: 'school-outline',
  restaurants: 'restaurant-outline',
  entertainment: 'film-outline',
  shopping: 'bag-outline',
  clothing: 'shirt-outline',
  personal_care: 'cut-outline',
  insurance: 'shield-checkmark-outline',
  debt: 'card-outline',
  subscriptions: 'repeat-outline',
  travel: 'airplane-outline',
  other: 'ellipsis-horizontal',
  salary: 'briefcase-outline',
  business: 'storefront-outline',
  freelance: 'laptop-outline',
  rental: 'key-outline',
  investment: 'trending-up-outline',
  bonus: 'ribbon-outline',
  gift: 'gift-outline',
  other_income: 'cash-outline',
};
export const categoryIcon = (id: string | null): IconName => MAP[id ?? ''] ?? 'pricetag-outline';

/** Chart colours for spending slices, in order of size. */
export const SLICE_COLORS = ['#FF5A5F', '#4DA3FF', '#27D98B', '#E2B04A', '#B07CFF', '#FF9F5A'];
