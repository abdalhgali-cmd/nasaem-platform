# الفرع التجميعي `integration/nasaem-unified-audit-20261102` — خريطة التوحيد (2 نوفمبر 2026)

**الغرض:** فرع تجميعي واحد قابل للاختبار والتحليل الهندسي قبل أي تطوير جديد.

**ما لم يحدث:**
- لا دمج في `main`.
- لا تعديل على فروع الـPRs الأصلية.
- لا نشر على Staging أو الإنتاج.
- لا ترحيلات على قواعد حقيقية.
- لا تغيير في البيانات أو الأسعار.
- لا force push.
- لم يُغلق أو يُحذف أي PR.

**المصدر:** `d70e3a0`، وهو رأس PR ‏#153.

## 1. ما أُضيف في هذا الفرع

| التغيير | المصدر | النتيجة |
|---|---|---|
| دمج `main` (‏`b93f3b4` و`2a50cd4`): ‏workflow ‏AI Dev Orchestra وأداة تشغيله | `main` | ملفان جديدان فقط، ولا يُلغيان أي تعديل أحدث. التشغيل يدوي فقط |
| دمج PR ‏#146 (حالة «طلباتي» المباشرة) | `fix/mobile-real-my-requests` | أُخذت الوظائف الناقصة فقط. حُلّت التعارضات بمنطقها (القسم 3) |

## 2. ما كان موجودًا مسبقًا (لا يُعاد تطبيقه)

**سلسلة PRs كاملة:** #139 ← #147 ← #148 ← #149 ← #150 ← #151 ← #152 ← #153. كل فرع فيها يحتوي الذي قبله.

**PRs محتواة بالـSHA:**
- #77–#89 و#91
- #111–#118 و#120
- #127–#131
- #134، و#136–#138
- #68، و#70–#72

**محتواة بالمحتوى** (نفس الملفات، بـSHA مختلف):

| الفرع | ملاحظة |
|---|---|
| #126 `chore/claude-codex-bridge-20261018` | |
| #133 `feat/egypt-payment-receipt-20261020` | |
| #57 `fix/esm-prisma-node22-compat` | |
| `fix/android-apk-version-update-20261018` | ‏`NASAEM_VERSION_CODE` و`nasaemVersionCode` موجودان |
| `feature/mobile-approved-design-20261018` | |
| `fix/mobile-faithful-design-20261018` | |
| `claude/mobile-home-c-phase2` | |
| `feature/service-intake-phase1-5` | |
| `feature/stage2-notifications` | |
| `fix/publish-admin-dashboard` | |
| `fix/web-flight-button-build` | |
| `claude/agency-app-arh-wasal-icu0xi` | |
| `claude/nasaem-alharamen-project-uzst8x` | |
| `claude/nasaem-customer-accounts-coupons-4vk247` | |

## 3. تعارضات PR ‏#146 وكيف حُلّت

| الملف | القرار | السبب |
|---|---|---|
| `mobile/www/js/screens/requests.js`، `request-list-view.js`، `request-payment.js`، CSS، الاختبار | أُخذت من #146 | وظائف ناقصة: الحالة والإجراء التالي وآخر تحديث، وتحديث يدوي وتلقائي كل 20 ثانية يتوقف بمغادرة الشاشة، و`id="requestReference"` |
| `web/e2e/pricing-progress.spec.ts` | لم يُؤخذ `describe.skip` | كان سيُوقف اختبار التسعير كاملًا. #151 أصلح هذا الاختبار دون إيقافه (`openKeptAppService`) |
| `web/e2e/service-journeys.spec.ts` | لم يُؤخذ حصر الرحلات في العمرة ومصر | يُسقط تغطية الخدمات المحفوظة. #151 يغطيها كلها |
| `web/e2e/mobile-app.spec.ts` | بقيت نسخة الفرع التجميعي | تطابق إعداد الملف نفسه (`packagePrice` و`packageId`) |
| `web/e2e/egypt-approval.spec.ts` | دمج منطقي | بقيت الفحوص الأقوى، وهي: الإيصال تحت المراجعة، واختفاء زر الإرسال، وصيغة المرجع. وأصبح المرجع يُقرأ عبر `#requestReference` |

## 4. الفروع غير المدمجة وتصنيفها

### أ. مفيد وغير مدمج — يحتاج قرار المالك

| الفرع / PR | المحتوى | سبب عدم الدمج |
|---|---|---|
| `claude/sleepy-gates-ta16m1` (ليس PR) | مصدر نظام التصميم المعتمد: الرموز والمكونات ودليل الهوية وتصاميم مركز العمليات، 76 ملفًا | مرجع تصميم يضيف قرابة 4400 سطر من ملفات التصميم. ملف `admin-theme.css` يشير إليه. الدمج نظيف، لكنه قرار: هل يدخل المستودع أم يبقى فرعًا مرجعيًا |
| #122 `claude/flight-providers-109` | سجل مزودي الطيران (طلب فقط)، وتوحيد العروض، وبوابة PNR محمية | الطيران خارج نطاق الإصدار الأول. 8 ملفات جديدة وقرار نطاق |
| #66 `claude/project-status-7g6tsy` | تصغير صور الجواز قبل OCR بـ`sharp` لمنع انهيار الذاكرة | الفرع التجميعي يحمي الذاكرة بطريقة أخرى: حد 24 ميغابكسل وطابور من 3. صورة بحجم 24 ميغابكسل ما زالت تُعالج بكامل دقتها. القرار: إضافة `sharp` (اعتمادية أصلية) أو الإبقاء على الحد |

### ب. قديم أو متجاوز بنسخة أحدث (لا يُدمج)

| الفرع / PR | السبب |
|---|---|
| #135 `codex/simplify-customer-experience-20261023` | تعديلات الصفحة الرئيسية تجاوزها #143 و#151. نص العمرة المختصر أُخذ سابقًا |
| `docs/umrah-egypt-claude-instructions-20261026` | يطلب إبقاء الخدمات الأخرى ظاهرة، وهذا يخالف قرار المالك اللاحق (العمرة ومصر فقط) |
| #90 `chore/claude-release-handoff-20261011` و#121 `claude/release-gate-97-110` | وثائق تجاوزها `CLAUDE.md` و`TASKS.md` الحاليان |
| #119 `test/combined-pr-20261017` | اختبار دمج تجريبي لـ#111–#118، وهي مدمجة الآن |
| `claude/laughing-sagan-mkdmtw` | نماذج تصميم Concept C. التصميم نُفّذ في التطبيق |
| `codex/continue-nasaem-20261012` و`claude/nasaem-customer-app-rebuild-ikzx56` | نسخ أقدم من التطبيق، أعاد بناءها Concept C ونطاق الإصدار الأول |
| `stabilize/production-readiness` (54 commit، 5 أكتوبر) | خط موازٍ تجاوزه إصلاح الإدارة #82–#86 و#91: جلسات قابلة للإلغاء، وCSRF، وحدود دخول لكل حساب ولكل IP، وتغيير كلمة المرور. ملاحظة في القسم 5 |
| فروع أغسطس–سبتمبر (نحو 60 فرعًا) | سبقت إعادة البناء. ميزاتها موجودة بصيغ أحدث: الطيران وFX اليدوي، والعبّارات، ومسار مصر، وحسابات العملاء والكوبونات، و`UPLOAD_ROOT`، والتحقق من نوع الملف بالبايتات، وتسعير الطيران من الخادم |

تشمل فروع أغسطس–سبتمبر:
- `feature/flight-*`
- `feature/flights-*`
- `feature/egypt-clearance-*`
- `fix/persistent-upload-storage` (#55)
- `fix/egypt-passport-upload` (#58)
- `fix/egypt-clearance-passport-requirement` (#53)
- `feature/egypt-clearance-provider-workflow` (#54)
- `ux/service-first-homepage` (#60)
- `feature/mobile-app-v2` (#67)
- `codex/nasaem-mobile-v2` (#73)
- `claude/project-status-*`
- `claude/extract-errors-*`

| مكررات | السبب |
|---|---|
| `feature/flight-booking-employee-console<رقم>` (153 فرعًا مرقّمًا) | نسخ متطابقة من `feature/flight-booking-employee-console` |

### ج. متعارض ويحتاج قرارًا

لا يوجد فرع مفيد وغير مدمج يتعارض مع الفرع التجميعي، خارج ما ورد في (أ).

## 5. ملاحظات أمان للتحليل الهندسي (لم تُعدّل هنا)

1. **رموز التحقق لمرة واحدة (OTP):**
   - حدودها لكل IP فقط، وليست لكل رقم هاتف. ينطبق هذا على `contact-request-tracking` و`customer-auth`.
   - كان في `stabilize` إصلاح لهذا (`90af030`) لم يصل إلى الخط الحالي.
   - يُقترح نقله بعد مراجعته.
2. **AI Dev Orchestra:**
   - يثبّت أدوات الوكلاء دون تثبيت رقم الإصدار (`npm install --global …`)، وهذا خطر سلسلة توريد.
   - يحتاج المفتاحين `ANTHROPIC_API_KEY` و`OPENAI_API_KEY` في أسرار المستودع. بدونهما يتوقف بأمان.
3. **جلسة دخول الموظفين على Staging:** تعمل بين نطاقين مختلفين، وSafari يمنع ملفات تعريف الارتباط هنا. التفاصيل في `docs/release/STAGING-UNIFIED-ADMIN-ar.md`.

## 6. نطاق العملاء

- طلبات العملاء الجديدة للعمرة والموافقة الأمنية لمصر فقط. يفرض ذلك الخادم في #152 والواجهات في #151.
- السجلات والخدمات الأخرى لم يُحذف منها شيء.
