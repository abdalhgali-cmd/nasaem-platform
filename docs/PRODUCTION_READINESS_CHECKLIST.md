# NASAEM — Production Readiness Checklist

> هذه الوثيقة لا تعني أن Production جاهزة. لا تُعتبر `UNKNOWN` مساوية لـ`PASS`. يجب إرفاق دليل تشغيل فعلي لكل بند قبل الإطلاق.

| Gate | Required evidence | Status | Owner |
|---|---|---|---|
| Commercial data | أسعار Visa وUmrah وحزم وخدمات حقيقية معتمدة | OWNER INPUT REQUIRED | Business Owner |
| Legal | Privacy، Terms، Cancellation، Refund، Payment Information ونص document notice معتمد | LEGAL INPUT REQUIRED | Legal Owner |
| Infrastructure | Railway/Vercel project، domains، API، CORS، health، replicas، limits موثقة | INFRASTRUCTURE INPUT REQUIRED | Infra Owner |
| Backup | Backup schedule، encryption، retention، success alerts | INFRASTRUCTURE INPUT REQUIRED | Infra Owner |
| Restore | Restore drill موثق، RPO/RTO مقاسان، rollback plan مجرب | INFRASTRUCTURE INPUT REQUIRED | Infra Owner |
| Monitoring | uptime، API errors، DB health، queue/upload/payment failures، alerts | INFRASTRUCTURE INPUT REQUIRED | Infra Owner |
| Security | auth/RBAC/IDOR/upload/download/error leakage review مع evidence | PASS at repository level; staging verification required | Security |
| Payment | قرار manual-only أو provider معتمد، reconciliation، refunds، webhooks | OWNER/PROVIDER INPUT REQUIRED | Finance |
| Supplier | قرارات flight/hotel/Umrah/visa providers وavailability contract | SUPPLIER INPUT REQUIRED | Operations |
| Mobile | staging visual QA للرحلات الرئيسية وRTL | STAGING VERIFICATION REQUIRED | QA |
| Accessibility | keyboard/focus/labels/aria/contrast/reduced-motion audit | STAGING VERIFICATION REQUIRED | QA |
| SEO | public metadata، canonical، OG، robots، sitemap، structured data | STAGING VERIFICATION REQUIRED | Marketing |
| Analytics | privacy decision، event allowlist، retention، consent إن لزم | OWNER INPUT REQUIRED | Product + Privacy |
| Rollback | deployment rollback steps and owner | UNKNOWN | Infra Owner |
| Incident response | severity matrix، escalation، customer communication، evidence retention | UNKNOWN | Operations |

## Release rule

لا تُعلن `READY FOR PUBLIC PRODUCTION` إلا بعد إغلاق جميع البنود الحرجة، بما فيها real commercial data وlegal approval وbackup/restore وmonitoring وinfrastructure verification وstaging QA وpayment/supplier decisions. حتى ذلك الحين يكون التصنيف: **READY FOR CONTROLLED STAGING / OWNER REVIEW**.
