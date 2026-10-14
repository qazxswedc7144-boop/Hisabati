حساباتي | Hisabati

«Offline-First AI-Assisted Accounting & Debt Tracking App»

حساباتي (Hisabati) هو نظام محاسبي وإداري ذكي مصمم ليكون Offline-First، Mobile-First، سريعًا، آمنًا، وقابلًا للتوسع، مع دعم اللغة العربية وواجهة RTL ودمج قدرات الذكاء الاصطناعي لمساعدة المستخدم في التحليل والمراجعة واتخاذ القرار.

---

1. Project Mission

الهدف الأساسي من المشروع هو بناء تطبيق محاسبي عملي يساعد الأفراد والتجار الصغار وأصحاب الدكاكين على تسجيل ومتابعة بياناتهم المالية اليومية، مع التركيز على:
- تسجيل ومتابعة الحركات المالية.
- تتبع الديون والمبالغ المستحقة، وفق الوظائف المدعومة فعليًا.
- متابعة الحسابات والأرصدة المرتبطة بالسجلات المالية المتاحة.
- عرض التقارير والملخصات المالية التي يدعمها التطبيق فعليًا.
- الاستفادة من المساعد المالي بالذكاء الاصطناعي ضمن حدود البيانات والوظائف المتاحة.
- العمل دون اتصال بالإنترنت للوظائف الأساسية المدعومة.
- مزامنة البيانات بأمان عند توفر الاتصال، وفق آليات المزامنة الموجودة.

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

5. Financial Transaction Rules

تُعد معالجة الحركات المالية من الأجزاء الحساسة في النظام.
يجب أن تمر كل عملية مالية عبر طبقة المعالجة والتحقق المناسبة الموجودة في التطبيق، مع الحفاظ على سلامة البيانات وعدم تجاوز قواعد العمل.
يجب الحفاظ على المبادئ التالية بحسب ما ينطبق على نوع العملية:
- Transaction Integrity.
- صحة الأرصدة والحسابات.
- Posting وReversal، حيثما كانا مدعومين.
- Audit Trail.
- Referential Integrity.
- منع تكرار الأثر المالي للعملية نفسها.
أي تعديل أو حذف لحركة مالية يجب أن يحافظ على سلامة السجل والأثر المالي، وأن يتبع الآليات الموجودة في التطبيق.
Never silently mutate financial records or balances.

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

10. AI Financial Assistant

يعمل المساعد المالي بالذكاء الاصطناعي على مساعدة المستخدم في فهم بياناته المالية المتاحة، دون أن يكون مصدرًا مستقلًا للحقيقة المالية.
يجب أن تقتصر إجاباته وتحليلاته على البيانات والوظائف المتاحة فعليًا في التطبيق، مثل:
- تفسير الحركات المالية المسجلة.
- شرح المصروفات والإيرادات المسجلة، عند توفرها.
- المساعدة في فهم الأرصدة والديون المسجلة، عند توفر البيانات اللازمة.
- توضيح التقارير والملخصات التي يدعمها التطبيق.
- التنبيه إلى أنماط أو تناقضات محتملة فقط عندما تسمح البيانات المتاحة بذلك.
- اقتراح خطوات للمراجعة دون تنفيذ تغييرات مالية من تلقاء نفسه.
لا تدّعِ وجود تحليل للمبيعات أو الأرباح أو مؤشرات أداء تجارية ما لم تكن تلك البيانات والوظائف مدعومة فعليًا.
يجب دائمًا الفصل بين:
Analysis ≠ Financial Mutation
التحليل لا يغيّر البيانات المالية، وأي إجراء مؤثر ماليًا يجب أن يخضع للتحقق وقواعد العمل والتأكيد المطلوب.

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

16. Financial Data Entry Rules

يجب أن يكون إدخال الحركات المالية سريعًا وواضحًا، وأن يقلل أخطاء المستخدم أثناء الاستخدام اليومي.
الأولويات:
- وضوح البيانات المطلوبة.
- التحقق من صحة المدخلات.
- تحديد الحسابات أو الأطراف المرتبطة بالعملية عند الحاجة.
- إدخال المبلغ والعملة بصورة صحيحة.
- توضيح أثر العملية قبل اعتمادها، عندما يكون ذلك مطلوبًا.
- منع التكرار غير المقصود.
- حفظ العملية عبر مسار المعالجة المالية المعتمد.
- إظهار نتيجة الحفظ أو الخطأ بوضوح.
لا تفترض وجود POS أو Barcode أو منتجات أو خصومات أو مسار دفع خاص بالمبيعات.

---

17. Printing and Export

يجب توثيق متطلبات الطباعة والتصدير بحسب الوظائف المدعومة فعليًا في التطبيق.
عندما تكون وظيفة الطباعة أو التصدير متاحة، يجب مراعاة ما ينطبق عليها من:
- وضوح البيانات المالية.
- دعم النص العربي واتجاه RTL.
- صحة المبالغ والعملات والإجماليات.
- قابلية قراءة المحتوى على حجم الصفحة أو وسيط الطباعة المدعوم.
- التعامل السليم مع المحتوى الطويل وتقسيم الصفحات، عند الحاجة.
- اختبار المعاينة والنتيجة النهائية قبل إعلان الوظيفة مكتملة.
لا تعلن دعم A4 أو إيصالات 58mm أو 80mm أو تنسيق فواتير محدد إلا إذا كان ذلك مدعومًا فعليًا.

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

قبل اعتماد أي تغيير مهم، يجب اختبار الوظائف التي تأثرت بالتغيير وفقًا لنطاق التطبيق الفعلي.
Functional
اختبر، حيثما ينطبق:
- إنشاء السجلات المالية وقراءتها وتعديلها وحذفها عبر المسارات المدعومة.
- البحث والتصفية.
- صحة المدخلات والحسابات.
- تتبع الديون والمبالغ المستحقة، إذا تأثرت.
- التعامل مع البيانات الفارغة والأخطاء.
Financial Integrity
اختبر، حيثما ينطبق:
- صحة الأرصدة.
- صحة المبالغ والعملات.
- عدم تكرار الأثر المالي.
- سلامة التعديل أو الإلغاء.
- سلامة سجل التدقيق.
Performance
اختبر:
- أحجام البيانات الواقعية والمتزايدة.
- الاستجابة على الأجهزة الضعيفة.
- التنقل المتكرر.
- عدم حدوث تراجع غير مقصود في الأداء.
Offline & Sync
اختبر:
- إنشاء البيانات وتعديلها دون اتصال، للوظائف التي تدعم ذلك.
- استعادة الاتصال.
- المزامنة.
- معالجة التعارضات والأخطاء.
- منع تكرار العمليات.
لا تستخدم وجود منتجات أو فواتير مبيعات أو مخزون كافتراض عام للاختبارات، ما لم تكن هناك وظيفة محددة في الكود تعتمد عليها.

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

32. ما ليس من نطاق التطبيق

حساباتي | Hisabati هو تطبيق للمحاسبة اليومية ومتابعة البيانات المالية والديون، وليس نظامًا شاملًا لإدارة المؤسسات أو العمليات التجارية.

ما لم تكن وظيفة محددة مدعومة فعليًا في الكود، فلا ينبغي اعتبار العناصر التالية جزءًا من نطاق التطبيق:

- نظام نقاط البيع (POS) وإدارة عمليات البيع.
- إدارة المشتريات والفواتير التجارية.
- إدارة المنتجات والمخزون ومستوياته.
- إدارة علاقات الموردين أو CRM للموردين.
- التحليلات التجارية المبنية على بيانات مبيعات أو مخزون غير متوفرة.
- أي وظيفة ERP أو إدارة مؤسسات لا يدعمها التطبيق فعليًا.

هذه الحدود لا تعني حذف أي مبدأ محاسبي أو هندسي عام. يجب الحفاظ على سلامة البيانات المالية، وصحة الأرصدة، وموثوقية المزامنة، والأمان، والعمل دون اتصال، وسجل التدقيق، وسائر المبادئ التي تنطبق على الوظائف الموجودة.

عند تنفيذ أي تطوير مستقبلي، يجب أولًا التحقق من نطاق الوظائف الحالية في الكود. لا تضف وظيفة جديدة ولا تصفها بأنها موجودة لمجرد ورودها في مثال أو قاعدة هندسية.

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
