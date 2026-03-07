# 🌹 Själ & Hjärta — موقع مواعدة سويدي مدعوم بالذكاء الاصطناعي

## 📁 هيكل المشروع

```
sjalhjarta/
├── backend/                    # Node.js + Express API
│   ├── config/
│   │   ├── database.js         # اتصال PostgreSQL
│   │   └── migrate.js          # إنشاء جداول قاعدة البيانات
│   ├── middleware/
│   │   └── auth.js             # JWT Authentication
│   ├── routes/
│   │   ├── auth.js             # تسجيل/دخول
│   │   ├── profiles.js         # البروفايلات
│   │   ├── matches.js          # المطابقات والمحادثات
│   │   ├── ai.js               # Stella AI Coach (Claude API)
│   │   ├── subscriptions.js    # الاشتراكات (Stripe)
│   │   └── admin.js            # لوحة الإدارة
│   ├── .env.example            # متغيرات البيئة
│   ├── package.json
│   ├── server.js               # نقطة البداية
│   └── Dockerfile
│
├── frontend/                   # 5 صفحات HTML
│   ├── index.html              # الصفحة الرئيسية
│   ├── css/shared.css          # CSS مشترك
│   ├── js/api.js               # طلبات API مشتركة
│   └── pages/
│       ├── app.html            # اكتشاف المطابقات
│       ├── matches.html        # المحادثات
│       ├── profile.html        # البروفايل الشخصي
│       ├── pricing.html        # الاشتراكات والأسعار
│       └── admin.html          # لوحة الإدارة
│
├── docker-compose.yml          # تشغيل كامل بأمر واحد
├── nginx.conf                  # إعدادات Nginx
└── README.md
```

---

## 🚀 تشغيل المشروع

### الطريقة 1: Docker (الأسهل)

```bash
# 1. نسخ متغيرات البيئة
cp backend/.env.example backend/.env

# 2. ملء المتغيرات في backend/.env
# - DB_PASSWORD
# - JWT_SECRET
# - ANTHROPIC_API_KEY
# - STRIPE_SECRET_KEY (اختياري)

# 3. تشغيل كل شيء بأمر واحد
docker-compose up -d

# 4. إنشاء جداول قاعدة البيانات
docker exec sjh_api node config/migrate.js

# 5. افتح المتصفح
# Frontend: http://localhost:3000
# API:      http://localhost:5000
```

### الطريقة 2: تشغيل محلي

```bash
# 1. تثبيت PostgreSQL وإنشاء قاعدة بيانات
createdb sjalhjarta

# 2. إعداد الـ Backend
cd backend
cp .env.example .env
# عدّل .env بمعلوماتك
npm install
node config/migrate.js   # إنشاء الجداول
npm run dev              # تشغيل على port 5000

# 3. الـ Frontend
# افتح frontend/index.html في المتصفح
# أو استخدم Live Server في VS Code
```

---

## 🔑 متغيرات البيئة المطلوبة

| المتغير | الوصف | مطلوب |
|---------|-------|--------|
| `DB_PASSWORD` | كلمة سر PostgreSQL | ✅ |
| `JWT_SECRET` | مفتاح سري للـ JWT (طويل عشوائي) | ✅ |
| `ANTHROPIC_API_KEY` | مفتاح Claude API | ✅ للـ AI |
| `STRIPE_SECRET_KEY` | مفتاح Stripe | للدفع فقط |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook Secret | للدفع فقط |

---

## 📊 API Endpoints

### Auth
| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/api/auth/register` | تسجيل مستخدم جديد |
| POST | `/api/auth/login` | تسجيل الدخول |
| GET | `/api/auth/me` | بيانات المستخدم الحالي |

### Profiles
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/profiles/me` | بروفايلي |
| PUT | `/api/profiles/me` | تحديث بروفايلي |
| GET | `/api/profiles/discover` | اكتشاف بروفايلات |
| POST | `/api/profiles/avatar` | رفع صورة |

### Matches
| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/api/matches/like/:userId` | الإعجاب بمستخدم |
| POST | `/api/matches/pass/:userId` | تجاوز مستخدم |
| GET | `/api/matches` | كل المطابقات |
| GET | `/api/matches/:matchId/messages` | رسائل محادثة |
| POST | `/api/matches/:matchId/messages` | إرسال رسالة |

### AI Coach
| Method | Endpoint | الوصف |
|--------|----------|-------|
| POST | `/api/ai/chat` | دردشة مع Stella AI |
| POST | `/api/ai/analyze-profile` | تحليل البروفايل |
| POST | `/api/ai/message-suggestion` | اقتراح رسائل |

### Admin (admin only)
| Method | Endpoint | الوصف |
|--------|----------|-------|
| GET | `/api/admin/stats` | إحصائيات عامة |
| GET | `/api/admin/users` | قائمة المستخدمين |
| PUT | `/api/admin/users/:id/ban` | حظر مستخدم |
| GET | `/api/admin/payments` | الدفعات |
| GET | `/api/admin/reports` | الشكاوى |

---

## 🎨 الصفحات

1. **`/index.html`** — الصفحة الرئيسية + تسجيل/دخول
2. **`/pages/app.html`** — اكتشاف المطابقات + Stella AI
3. **`/pages/matches.html`** — المحادثات مع المطابقات
4. **`/pages/profile.html`** — البروفايل + تحليل AI
5. **`/pages/pricing.html`** — خطط الاشتراك + Stripe
6. **`/pages/admin.html`** — لوحة إدارة كاملة

---

## 🛠 للنشر على الإنترنت

### خيارات النشر
- **Railway.app** — أسهل خيار لـ Node.js + PostgreSQL
- **Render.com** — مجاني للبداية
- **DigitalOcean** — VPS مع Docker
- **AWS / Google Cloud** — للإنتاج الاحترافي

### نشر سريع على Railway
```bash
# 1. ارفع الكود على GitHub
git init && git add . && git commit -m "Initial"

# 2. اذهب إلى railway.app
# 3. "New Project" → "Deploy from GitHub"
# 4. أضف PostgreSQL plugin
# 5. أضف متغيرات البيئة
# 6. انشر!
```

---

## 🤖 الذكاء الاصطناعي (Claude API)

الموقع يستخدم **Claude claude-sonnet-4-20250514** في:
- **Stella AI Coach** — مساعد المحادثة
- **تحليل البروفايل** — اقتراحات تحسين
- **اقتراح الرسائل** — 3 أساليب مختلفة
- **حساب التوافق** — نسبة AI بين المستخدمين

---

*Själ & Hjärta — Sveriges smartaste dejtingplattform* 🌹
