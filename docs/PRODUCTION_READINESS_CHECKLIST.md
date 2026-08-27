# NASAEM — Production Readiness Checklist

> لا تعني هذه الوثيقة أن Production جاهزة. لا تُعتبر `UNKNOWN` مساوية لـ`PASS`، ولا يُغلق أي gate دون evidence قابل للتدقيق.

| Gate | Expected | Actual | Status | Evidence | Owner |
|---|---|---|---|---|---|
| Commercial data | Visa/Umrah/services/prices/contact/approved content حقيقية | لم تُقدم بيانات المالك داخل المهمة | OWNER INPUT REQUIRED | لا يوجد evidence خارجي | Business Owner |
| Legal | النصوص الرسمية للخصوصية والشروط والإلغاء والاسترداد والدفع وإشعار الوثائق | صفحات تقنية placeholder فقط | LEGAL INPUT REQUIRED | Legal approval غير متوفر | Legal Owner |
| Infrastructure | Railway/Vercel/API/CORS/health/replicas/limits موثقة | غير قابلة للتحقق من repository | UNKNOWN — INFRASTRUCTURE INPUT REQUIRED | Dashboard evidence مطلوب | Infra Owner |
| Backup | schedule/encryption/retention/success alerts | غير مثبت | UNKNOWN — INFRASTRUCTURE INPUT REQUIRED | Backup report مطلوب | Infra Owner |
| Restore | isolated restore drill مع RPO/RTO وrollback | لم يُنفذ | UNKNOWN — INFRASTRUCTURE INPUT REQUIRED | Restore evidence مطلوب | Infra Owner |
| Monitoring | uptime/API/DB/auth/upload/payment/storage/resource alerts | غير مثبت | UNKNOWN — INFRASTRUCTURE INPUT REQUIRED | Monitoring dashboard/alert test مطلوب | Infra Owner |
| Security | auth/RBAC/IDOR/uploads/downloads/errors review | repository checks وCI ناجحة؛ staging verification غير منفذة | REPOSITORY PASS / STAGING UNKNOWN | PR #42 وCI run `33065648131` | Security |
| Payment | manual-only decision أو provider معتمد مع reconciliation/refunds/webhooks | manual payment workflow فقط؛ لا provider gateway | MANUAL PAYMENT — STAGING UNKNOWN | Payment code/tests | Finance |
| Supplier | providers وavailability contract موثقة | لا supplier integration موثق | SUPPLIER INPUT REQUIRED | لا يوجد provider evidence | Operations |
| Mobile | visual QA للرحلات الرئيسية وRTL | Playwright coverage موجود؛ visual staging غير منفذ | STAGING VERIFICATION REQUIRED | CI Playwright | QA |
| Accessibility | keyboard/focus/labels/aria/contrast/reduced motion audit | lint/typecheck فقط؛ audit شامل غير منفذ | STAGING VERIFICATION REQUIRED | CI build evidence | QA |
| SEO | metadata/canonical/OG/robots/sitemap/structured data validated | implementation موجود؛ staging verification غير منفذ | STAGING VERIFICATION REQUIRED | SEO source review | Marketing |
| Analytics | privacy/event allowlist/retention/consent decision | لا provider ولا credentials | OWNER INPUT REQUIRED | لا analytics provider | Product + Privacy |
| Rollback | immutable artifact وprocedure وowner مجرب | runbook موجود؛ drill غير منفذ | UNKNOWN — INFRASTRUCTURE INPUT REQUIRED | Runbook only | Infra Owner |
| Incident response | severity/escalation/customer comms/evidence retention | runbook موجود؛ operational drill غير منفذ | UNKNOWN — INFRASTRUCTURE INPUT REQUIRED | Runbook only | Operations |

## Release rule

لا تُعلن `READY FOR PUBLIC PRODUCTION` إلا بعد إثبات commercial data وlegal approval وinfrastructure verification وbackup/restore وmonitoring وstaging QA وpayment/supplier decisions. الحالة الحالية هي **READY FOR CONTROLLED STAGING / OWNER REVIEW** فقط.
