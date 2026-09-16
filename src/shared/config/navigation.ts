import React from 'react';
import {
  Home,
  Users,
  BarChart3,
  Activity,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  Trash2,
  Settings,
  LucideIcon,
} from 'lucide-react';

export interface NavItemConfig {
  to: string;
  labelKey?: string;
  fallbackLabel: string;
  icon: LucideIcon;
  exact?: boolean;
  hasBadge?: boolean;
}

/**
 * Canonical Application Navigation Registry.
 * Shared between Desktop Sidebar and Mobile Navigation Drawer.
 * Guarantees 100% parity across desktop and mobile form factors.
 */
export const APPLICATION_NAV_ITEMS: NavItemConfig[] = [
  {
    to: '/',
    labelKey: 'nav.dashboard',
    fallbackLabel: 'الرئيسية',
    icon: Home,
    exact: true,
  },
  {
    to: '/accounts',
    labelKey: 'nav.accounts',
    fallbackLabel: 'الحسابات',
    icon: Users,
  },
  {
    to: '/reports',
    labelKey: 'nav.reports',
    fallbackLabel: 'التقارير',
    icon: BarChart3,
  },
  {
    to: '/bi',
    fallbackLabel: 'الصحة المالية (BI)',
    icon: Activity,
  },
  {
    to: '/messaging',
    labelKey: 'nav.messaging',
    fallbackLabel: 'الإشعارات والتنبيهات',
    icon: MessageSquare,
    hasBadge: true,
  },
  {
    to: '/ai',
    fallbackLabel: 'المساعد الذكي (AI)',
    icon: Sparkles,
  },
  {
    to: '/team',
    fallbackLabel: 'الفريق والتدقيق (RBAC)',
    icon: ShieldCheck,
  },
  {
    to: '/trash',
    fallbackLabel: 'سلة المهملات',
    icon: Trash2,
  },
  {
    to: '/settings',
    labelKey: 'nav.settings',
    fallbackLabel: 'الإعدادات',
    icon: Settings,
  },
];
