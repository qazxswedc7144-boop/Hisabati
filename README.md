حساباتي | Hisabati

«Mobile-First AI Accounting & Business Management System»

حساباتي (Hisabati) هو نظام محاسبي وإداري ذكي مصمم ليكون Offline-First، Mobile-First، سريعًا، آمنًا، وقابلًا للتوسع، مع دعم اللغة العربية وواجهة RTL ودمج قدرات الذكاء الاصطناعي لمساعدة المستخدم في التحليل والمراجعة واتخاذ القرار.

---

1. Project Mission

الهدف الأساسي من المشروع هو بناء نظام محاسبي احترافي يمكن الاعتماد عليه في:

- المبيعات.
- المشتريات.
- المصروفات والإيرادات.
- العملاء والموردين.
- المنتجات والمخزون.
- القيود والحركات المحاسبية.
- دفتر الأستاذ العام.
- التقارير المالية.
- تحليل الأداء المالي.
- التنبيهات الذكية.
- المساعد المالي بالذكاء الاصطناعي.
- العمل دون اتصال بالإنترنت.
- المزامنة الآمنة عند توفر الاتصال.

الأولوية المطلقة هي صحة البيانات المالية وسلامتها قبل أي تحسين بصري أو ميزة جديدة.

---

2. Core Engineering Principles

يجب على أي مطور أو AI Agent يعمل على المشروع الالتزام بهذه المبادئ:

2.1 Financial Data Integrity

لا يجوز لأي تعديل أن يؤدي إلى:

- فقدان حركة مالية.
- تغيير قيمة قيد موجود بشكل غير مقصود.
- إنشاء قيد مزدوج.
- حذف سجل مالي دون آلية واضحة ومصرح بها.
- كسر التوازن المحاسبي.
- تغيير بيانات تاريخية دون Audit Trail.
- تغيير معنى البيانات الموجودة فقط لتسهيل تنفيذ ميزة جديدة.

البيانات المالية Existing Data هي Source of Truth.

---

2.2 Offline-First

التطبيق يجب أن يعمل بشكل طبيعي حتى عند انقطاع الإنترنت.

لا تعتمد الوظائف الأساسية على:

- API خارجي.
- Gemini.
- Firebase.
- Cloud Service.
- اتصال مستمر بالإنترنت.

يجب أن يستطيع المستخدم تنفيذ العمليات الأساسية محليًا، ثم تتم المزامنة لاحقًا بطريقة آمنة.

---

2.3 Mobile-First

التصميم الأساسي يبدأ من الهاتف.

يجب اختبار جميع الصفحات على:

1. هاتف صغير.
2. هاتف متوسط.
3. هاتف كبير.
4. Tablet.
5. Desktop.

لا يجوز بناء Desktop UI أولًا ثم محاولة ضغطه على الهاتف.

---

2.4 Arabic RTL First

اللغة العربية وRTL جزء أساسي من التصميم وليست إضافة لاحقة.

يجب مراعاة:

- RTL.
- النصوص العربية.
- الأرقام.
- العملات.
- التواريخ.
- الجداول.
- النماذج.
- القوائم.
- الأزرار.
- الطباعة.
- التقارير.

---

3. Technology Rules

يجب الحفاظ على التقنيات الموجودة في المشروع وعدم استبدالها بالكامل دون سبب هندسي قوي.

قبل تغيير أي framework أو database أو architecture:

1. افحص الاستخدام الحالي.
2. افهم dependencies.
3. افحص الملفات المرتبطة.
4. حدد التأثيرات الجانبية.
5. اختبر Build.
6. اختبر الوظائف المتأثرة.

Never rewrite the application from scratch just to solve a localized problem.

---

4. Architecture Rules

يجب الحفاظ على الفصل بين:

UI
↓
Hooks / State
↓
Business Logic
↓
Accounting / Transaction Services
↓
Data Layer
↓
Storage / Sync

لا تضع Business Logic المعقد داخل React Components.

لا تضع عمليات قاعدة البيانات مباشرة داخل UI إذا كان من الممكن عزلها داخل Service.

---

5. Accounting Engine Rules

المحرك المحاسبي هو أحد أكثر أجزاء النظام حساسية.

أي عملية مالية يجب أن تمر عبر طبقة محاسبية واضحة.

يجب دعم:

- Transaction Integrity.
- Double-entry accounting عندما تكون العملية ضمن النظام المزدوج.
- Posting.
- Re-Posting.
- Reversal.
- Audit Trail.
- Referential Integrity.

عند تعديل فاتورة أو حذفها أو إرجاعها، يجب التعامل مع أثرها المحاسبي بشكل صريح.

Never silently mutate posted financial transactions.

---

6. Database Rules

قبل تعديل Schema أو Models:

1. افحص جميع الاستخدامات الحالية.
2. ابحث عن جميع references.
3. تحقق من migration strategy.
4. حافظ على البيانات الحالية.
5. لا تحذف fields أو tables لمجرد أنها تبدو غير مستخدمة.
6. لا تغير أنواع البيانات المالية دون دراسة تأثيرها.

أي تغيير Database يجب أن يكون:

- Backward-aware.
- Migration-safe.
- Tested.
- Reversible whenever possible.

---

7. Concurrency & Transaction Safety

يجب الحذر الشديد عند التعامل مع:

- IndexedDB.
- Dexie.
- SQLite.
- Transactions.
- Sync Engine.
- Locks.
- Async operations.

تجنب:

- Transactions طويلة.
- Nested transactions غير ضرورية.
- Recursive keep-alive mechanisms.
- عمليات Network داخل Database Transactions.
- انتظار عمليات غير محدودة.
- Locks بدون Timeout.

كل عملية Async حساسة يجب أن تمتلك:

- Timeout.
- Error Handling.
- Recovery Path.

---

8. Performance Rules

الأداء أولوية أساسية، خصوصًا على أجهزة Android الضعيفة.

يجب تجنب:

- Large synchronous computations على Main Thread.
- Excessive React re-renders.
- إعادة معالجة البيانات بالكامل عند تعديل عنصر واحد.
- عمليات Sorting/Grouping ضخمة داخل UI.
- API requests متكررة بلا حاجة.
- AI requests غير محدودة.

استخدم عند الحاجة:

- Web Workers.
- Chunking.
- Memoization.
- Pagination.
- Virtualization.
- Caching.
- Debouncing.
- Incremental updates.

---

9. AI Rules

الذكاء الاصطناعي مساعد وليس مصدر الحقيقة المالية.

AI لا يجوز له:

- تعديل البيانات المالية مباشرة دون طبقة تحقق.
- حذف سجلات.
- إنشاء قيود نهائية دون Validation.
- تغيير أرصدة.
- تجاوز صلاحيات المستخدم.
- اعتبار نتيجة النموذج حقيقة محاسبية.

أي AI-generated action يجب أن يمر عبر:

AI Suggestion
↓
Validation
↓
Business Rules
↓
User Confirmation (when required)
↓
Transaction Engine
↓
Audit Trail

يجب كذلك حماية التطبيق من:

- Rate Limits.
- Duplicate Requests.
- Infinite Calls.
- API Failures.
- Timeout.
- Invalid AI Responses.

---

10. AI Accountant

المساعد المالي يجب أن يركز على:

- تحليل المبيعات.
- تحليل المصروفات.
- تحليل الأرباح.
- اكتشاف الأنماط غير الطبيعية.
- التنبيه إلى الأخطاء المحتملة.
- تفسير التقارير.
- الإجابة عن الأسئلة المالية.
- اقتراح الإجراءات.

لكن يجب دائمًا الفصل بين:

Analysis ≠ Financial Mutation

التحليل لا يغير البيانات.

---

11. Security Rules

لا تضع داخل Git:

- API Keys.
- Secrets.
- Passwords.
- Tokens.
- Private credentials.
- Production database credentials.

استخدم Environment Variables / Secrets Management.

يجب اعتبار كل API Key مكشوفًا إذا تم Commit له إلى Git.

---

12. Authentication & Authorization

الصلاحيات يجب أن تكون Server/Business-Logic enforced وليست UI-only.

إخفاء زر من الواجهة لا يعني منع العملية.

كل عملية حساسة يجب أن تتحقق من:

- User.
- Role.
- Permission.
- Tenant/Workspace.
- Ownership.
- Operation scope.

---

13. Multi-Tenant Safety

إذا كان النظام يدعم Multi-Tenant architecture:

Tenant isolation is mandatory.

لا يجوز أن يستطيع مستخدم من Workspace الوصول إلى بيانات Workspace آخر.

كل Query أو Mutation حساسة يجب أن تراعي Tenant/Workspace context.

---

14. Sync Engine

المزامنة يجب أن تكون:

- Offline-safe.
- Retry-safe.
- Idempotent.
- Conflict-aware.
- Observable.

يجب ألا تؤدي إعادة إرسال العملية إلى إنشاء:

Duplicate Invoice
Duplicate Payment
Duplicate Journal Entry

استخدم معرفات عمليات مستقرة وآلية تمنع Duplicate Processing.

---

15. UI/UX Rules

الواجهة يجب أن تكون:

- بسيطة.
- سريعة.
- واضحة.
- Mobile-first.
- RTL.
- Touch-friendly.
- قليلة الخطوات.
- مناسبة للاستخدام اليومي المكثف.

في الشاشات المحاسبية:

Speed of data entry > decorative UI

لا تضف Animation أو Component ثقيل إذا كان يؤثر على سرعة الاستخدام.

---

16. POS / Sales Rules

شاشة البيع يجب أن تكون optimized للسرعة.

الأولوية:

1. البحث.
2. Barcode.
3. إضافة المنتج.
4. تعديل الكمية.
5. السعر.
6. الخصم.
7. الإجمالي.
8. الدفع.
9. حفظ العملية.

يجب ألا يؤدي أي تحسين في POS إلى إبطاء إدخال الفاتورة.

---

17. Printing

الطباعة يجب أن تدعم حسب متطلبات المشروع:

- A4.
- Receipt 58mm.
- Receipt 80mm.
- Arabic RTL.
- Invoice formatting.
- Financial totals.
- Proper pagination.

يجب اختبار Print Preview قبل اعتبار ميزة الطباعة مكتملة.

---

18. Error Handling

لا تستخدم:

catch(() => {})

أو تخفي الأخطاء.

كل Error مهم يجب أن:

- يسجل.
- يظهر للمستخدم بطريقة مناسبة.
- يحتوي على Recovery Path.
- لا يؤدي إلى White Screen.
- لا يترك UI في Loading Forever.

أي Loading State يجب أن يمتلك Exit Path.

---

19. White Screen Protection

منع White Screen أولوية.

أي Feature جديدة يجب اختبار:

- Runtime exception.
- Failed API.
- Failed AI request.
- Database error.
- Empty data.
- Slow network.
- Offline mode.

التطبيق يجب أن يعرض Error Boundary / Recovery UI بدل انهيار التطبيق بالكامل.

---

20. Development Workflow

قبل تعديل أي ملف:

1. Inspect
2. Understand
3. Search References
4. Identify Dependencies
5. Make Minimal Change
6. Build
7. Test
8. Review Side Effects
9. Commit

Do not make speculative changes.

---

21. Minimal Change Principle

إذا كان الخطأ موجودًا في ملف واحد، لا تعيد بناء النظام كله.

استخدم:

«Smallest Safe Change»

كل Patch يجب أن يحل المشكلة المطلوبة مع أقل تأثير ممكن على باقي النظام.

---

22. Do Not Delete Existing Features

لا تحذف Feature أو Component أو Service لأنك لم تجد استخدامه مباشرة.

قبل الحذف:

Search all references
↓
Check routes
↓
Check imports
↓
Check dynamic usage
↓
Check database dependencies
↓
Check production usage
↓
Then decide

---

23. Testing Requirements

قبل اعتماد أي تغيير مهم:

Functional

اختبر:

- Create.
- Read.
- Update.
- Delete.
- Search.
- Filtering.
- Calculations.

Accounting

اختبر:

- Debit.
- Credit.
- Balance.
- Posting.
- Reversal.
- Returns.

Performance

اختبر:

- Large datasets.
- Many products.
- Large invoices.
- Repeated navigation.
- Slow devices.

Offline

اختبر:

- Offline creation.
- Offline editing.
- Reconnect.
- Sync.
- Duplicate prevention.

---

24. Git Rules

استخدم Commits واضحة:

feat:
fix:
refactor:
perf:
security:
docs:
test:
chore:

أمثلة:

fix: prevent duplicate invoice posting
perf: optimize inventory calculations
feat: add AI financial insights
security: harden tenant isolation
refactor: isolate accounting transaction service

لا تستخدم:

update
changes
final
test
new

كأسماء Commits مهمة.

---

25. Branch Safety

لا تعمل مباشرة على Production branch عند تنفيذ تغييرات كبيرة.

استخدم:

main
  └── feature/...
  └── fix/...
  └── perf/...

ثم:

Test
↓
Review
↓
Merge

---

26. AI Agent Instructions

عند استخدام Google AI Studio أو أي AI Coding Agent مع هذا المستودع:

يجب على AI Agent أن:

- يقرأ README.md أولًا.
- يفحص architecture قبل التعديل.
- يبحث عن references.
- يحافظ على البيانات الحالية.
- يحافظ على الميزات الحالية.
- ينفذ أقل تغيير آمن.
- لا يعيد كتابة المشروع بدون طلب صريح.
- لا يغير Database architecture دون موافقة.
- لا يضيف dependency غير ضرورية.
- لا يزيل dependency مستخدمة.
- يختبر Build بعد التعديل.
- يبلغ عن الملفات التي تم تغييرها.
- يبلغ عن المشاكل التي لم يستطع حلها.
- لا يدعي نجاح اختبار لم يتم تشغيله.

---

27. Mandatory AI Response Format

بعد تنفيذ أي مهمة، يجب على AI Agent تقديم:

## Implementation Summary

### Changed
- ...

### Files Modified
- ...

### Files Added
- ...

### Files Removed
- ...

### Tests
- Build: PASS/FAIL
- Type Check: PASS/FAIL
- Functional Test: PASS/FAIL

### Risks
- ...

### Remaining Issues
- ...

### Recommended Next Step
- ...

---

28. Project Phases

التطوير يتم على مراحل.

لا تبدأ مرحلة جديدة قبل مراجعة نتيجة المرحلة السابقة.

لكل Phase:

Audit
↓
Plan
↓
Implementation
↓
Testing
↓
Verification
↓
Report
↓
Next Phase

إذا كانت المرحلة كبيرة، يجب تقسيمها إلى أجزاء صغيرة:

PART 1
PART 2
PART 3
PART 4

ولا يتم تنفيذ جميع الأجزاء دفعة واحدة إذا كان ذلك يزيد خطر كسر النظام.

---

29. Priority Order

عند وجود تعارض بين الأولويات، استخدم الترتيب التالي:

1. Financial Data Integrity
2. Security
3. Stability
4. Correctness
5. Offline Reliability
6. Performance
7. UX
8. Visual Design
9. New Features

---

30. Definition of Done

لا تعتبر Feature مكتملة لمجرد ظهورها في UI.

Feature تعتبر Done عندما:

- تعمل وظيفيًا.
- تحفظ البيانات بشكل صحيح.
- تتعامل مع الأخطاء.
- تعمل Offline إذا كانت مطلوبة.
- لا تكسر الميزات الحالية.
- لا تسبب Regression.
- لا تسبب Performance degradation.
- تحترم RTL.
- تحترم الصلاحيات.
- تمر باختبارات Build/Type/Functional المناسبة.

---

31. Golden Rule

«Never sacrifice data integrity for speed, UI, AI, or convenience.»

والقاعدة الثانية:

«Understand the existing system before changing it.»

والقاعدة الثالثة:

«Preserve working functionality unless the task explicitly requires changing it.»

---

Project Status

هذا المشروع في حالة تطوير مستمر.

أي AI Agent أو Developer يدخل المستودع يجب أن يعتبر الكود الحالي نظامًا قائمًا يجب فهمه والحفاظ عليه وليس مشروعًا فارغًا يمكن إعادة بنائه من الصفر.

قبل أي Phase جديدة:

Read README
↓
Inspect Repository
↓
Audit Current State
↓
Identify Dependencies
↓
Implement
↓
Test
↓
Report
↓
Proceed to Next Phase

---

License

يتم تحديد الترخيص وفق سياسة مالك المشروع قبل أي نشر عام أو إعادة استخدام للكود.
