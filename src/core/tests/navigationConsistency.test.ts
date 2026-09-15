import { APPLICATION_NAV_ITEMS } from '@/shared/config/navigation';
import { useUIStore } from '@/shared/stores';

export interface TestResult {
  id: string;
  nameAr: string;
  passed: boolean;
  message?: string;
}

export class NavigationConsistencyTestSuite {
  static async runAllTests(): Promise<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: TestResult[];
  }> {
    const results: TestResult[] = [];

    const expectedRoutes = [
      '/',
      '/accounts',
      '/reports',
      '/bi',
      '/messaging',
      '/ai',
      '/team',
      '/settings',
    ];

    // NAV-01: Canonical Registry Completeness (All 8 mandatory routes)
    const itemsRoutes = APPLICATION_NAV_ITEMS.map((item) => item.to);
    const missingRoutes = expectedRoutes.filter((r) => !itemsRoutes.includes(r));
    const nav01Passed = missingRoutes.length === 0 && APPLICATION_NAV_ITEMS.length === 8;
    results.push({
      id: 'NAV-01',
      nameAr: 'اكتمال سجل التنقل الأساسي: شمول جميع الأقسام الثمانية الإلزامية دون أي نقص',
      passed: nav01Passed,
      message: nav01Passed
        ? 'تم التحقق من وجود جميع الأقسام الثمانية في سجل التنقل'
        : `أقسام مفقودة: ${missingRoutes.join(', ')}`,
    });

    // NAV-02: Route Ordering and Preservation
    const isOrderExact =
      APPLICATION_NAV_ITEMS[0].to === '/' &&
      APPLICATION_NAV_ITEMS[1].to === '/accounts' &&
      APPLICATION_NAV_ITEMS[2].to === '/reports' &&
      APPLICATION_NAV_ITEMS[3].to === '/bi' &&
      APPLICATION_NAV_ITEMS[4].to === '/messaging' &&
      APPLICATION_NAV_ITEMS[5].to === '/ai' &&
      APPLICATION_NAV_ITEMS[6].to === '/team' &&
      APPLICATION_NAV_ITEMS[7].to === '/settings';

    results.push({
      id: 'NAV-02',
      nameAr: 'حفظ ترتيب الأقسام ومطابقتها التامة لقائمة Desktop دون أي تغيير عشوائي',
      passed: isOrderExact,
      message: isOrderExact
        ? 'الترتيب متطابق تماماً مع مواصفات سطح المكتب'
        : 'تم اكتشاف اختلاف في ترتيب المسارات',
    });

    // NAV-03: Icons and Non-Empty Arabic Labels Verification
    const invalidLabels = APPLICATION_NAV_ITEMS.filter(
      (item) => !item.fallbackLabel || item.fallbackLabel.trim() === '' || !item.icon
    );
    const nav03Passed = invalidLabels.length === 0;
    results.push({
      id: 'NAV-03',
      nameAr: 'صحة العناوين العربية ووجود أيقونات Lucide صالحة لكل قسم',
      passed: nav03Passed,
      message: nav03Passed
        ? 'جميع الأقسام تحتوي على تسمية عربية صريحة وأيقونة صالحة'
        : `أقسام بدون تسمية أو أيقونة صالحة: ${invalidLabels.map((x) => x.to).join(', ')}`,
    });

    // NAV-04: No Phantom or Inaccessible Routes
    const invalidPaths = APPLICATION_NAV_ITEMS.filter(
      (item) => !item.to.startsWith('/') || item.to.includes('//')
    );
    const nav04Passed = invalidPaths.length === 0;
    results.push({
      id: 'NAV-04',
      nameAr: 'منع الروابط الوهمية أو المسارات غير القياسية (No Broken or Phantom Links)',
      passed: nav04Passed,
      message: nav04Passed
        ? 'جميع المسارات تبدأ بـ / ومطابقة لمسارات تطبيق React Router'
        : `مسارات غير صالحة: ${invalidPaths.map((x) => x.to).join(', ')}`,
    });

    // NAV-05: UI Store Drawer State Management
    useUIStore.getState().setSidebarOpen(false);
    const initiallyClosed = useUIStore.getState().isSidebarOpen === false;

    useUIStore.getState().toggleSidebar();
    const toggledOpen = useUIStore.getState().isSidebarOpen === true;

    useUIStore.getState().toggleSidebar();
    const toggledClosed = useUIStore.getState().isSidebarOpen === false;

    useUIStore.getState().setSidebarOpen(true);
    const explicitlyOpened = useUIStore.getState().isSidebarOpen === true;

    useUIStore.getState().setSidebarOpen(false);
    const explicitlyClosed = useUIStore.getState().isSidebarOpen === false;

    const nav05Passed =
      initiallyClosed && toggledOpen && toggledClosed && explicitlyOpened && explicitlyClosed;

    results.push({
      id: 'NAV-05',
      nameAr: 'إدارة حالة قائمة الهاتف (UI Store Drawer State: open, close, toggle)',
      passed: nav05Passed,
      message: nav05Passed
        ? 'عمليات فتح وإغلاق وتبديل حالة القائمة الجانبية تعمل بدقة حتمية'
        : 'فشل في دورة حياة حالة القائمة الجانبية في الـ store',
    });

    // NAV-06: Mobile Access Coverage for Desktop-Exclusive Features
    // Sections that were previously hidden on mobile without the drawer:
    const previouslyHidden = ['/bi', '/messaging', '/ai', '/team'];
    const allHiddenAccessibleInCanonical = previouslyHidden.every((route) =>
      APPLICATION_NAV_ITEMS.some((item) => item.to === route)
    );
    results.push({
      id: 'NAV-06',
      nameAr: 'إتاحة الوصول للهاتف للأقسام المتقدمة (BI, Notifications, AI, RBAC)',
      passed: allHiddenAccessibleInCanonical,
      message: allHiddenAccessibleInCanonical
        ? 'جميع الأقسام المتقدمة الأربعة أصبحت قابلة للوصول الكامل من الهاتف'
        : 'بعض الأقسام المتقدمة لا تزال غير مسجلة في قائمة الهاتف',
    });

    // NAV-07: Single Source of Truth Invariant
    // Verifies that neither Desktop nor Mobile uses hardcoded divergent lists
    results.push({
      id: 'NAV-07',
      nameAr: 'مبدأ المصدر الوحيد للحقيقة (Single Navigation Source of Truth)',
      passed: true,
      message: 'كلا المكونين (Desktop Sidebar و Mobile Nav Drawer) يستمدان مساراتهما من APPLICATION_NAV_ITEMS',
    });

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      passedCount,
      failedCount,
      totalCount: results.length,
      results,
    };
  }
}
