const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// مسار ملف قاعدة البيانات
const DB_PATH = path.join(__dirname, "licenses-db.json");

// دالة لتحميل البيانات
function loadDB() {
  const raw = fs.readFileSync(DB_PATH, "utf8");
  return JSON.parse(raw);
}

// دالة لحفظ البيانات
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ============================
// 🔐 نظام تسجيل دخول المسؤول
// ============================

const ADMIN_PASSWORD = "admin123"; // غيّرها لكلمة قوية
const MASTER_TOKEN = "MASTER_ADMIN_TOKEN_123456"; // غيّرها لأي قيمة

// مسار تسجيل الدخول
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    return res.json({
      ok: true,
      token: MASTER_TOKEN
    });
  }

  return res.json({
    ok: false,
    message: "كلمة المرور غير صحيحة"
  });
});

// Middleware لحماية مسارات لوحة التحكم
app.use((req, res, next) => {
  if (req.path.startsWith("/api/admin") && req.path !== "/api/admin/login") {
    const token = req.headers["x-admin-token"];

    if (token !== MASTER_TOKEN) {
      return res.status(403).json({ ok: false, message: "غير مصرح" });
    }
  }
  next();
});

// ============================
// API: قراءة المفاتيح (Admin)
// ============================

app.get("/api/admin/licenses", (req, res) => {
  const db = loadDB();
  res.json(db);
});

// ============================
// API: إضافة مفتاح
// ============================

app.post("/api/admin/add", (req, res) => {
  const { key, expiresAt } = req.body;

  const db = loadDB();

  db.licenses.push({
    key,
    hwid: null,
    expiresAt,
    disabled: false,
    note: null
  });

  saveDB(db);
  res.json({ ok: true });
});

// ============================
// API: Reset HWID
// ============================

app.post("/api/admin/reset-hwid", (req, res) => {
  const { key } = req.body;

  const db = loadDB();
  const lic = db.licenses.find(l => l.key === key);

  if (lic) {
    lic.hwid = null;
    saveDB(db);
  }

  res.json({ ok: true });
});

// ============================
// API: Enable / Disable مفتاح
// ============================

app.post("/api/admin/toggle-disable", (req, res) => {
  const { key } = req.body;

  const db = loadDB();
  const lic = db.licenses.find(l => l.key === key);

  if (lic) {
    lic.disabled = !lic.disabled;
    saveDB(db);
  }

  res.json({ ok: true });
});

// ============================
// API: حذف مفتاح
// ============================

app.post("/api/admin/delete", (req, res) => {
  const { key } = req.body;

  let db = loadDB();
  db.licenses = db.licenses.filter(l => l.key !== key);

  saveDB(db);
  res.json({ ok: true });
});

// ============================
// API: تفعيل المستخدم (Electron)
// ============================

app.post("/api/activate", (req, res) => {
  const { key, hwid } = req.body;

  const db = loadDB();
  const lic = db.licenses.find(l => l.key === key);

  if (!lic) {
    return res.json({ ok: false, message: "مفتاح غير موجود" });
  }

  if (lic.disabled) {
    return res.json({ ok: false, message: "تم إيقاف المفتاح" });
  }

  // لو عنده HWID محفوظ → لازم يطابق
  if (lic.hwid && lic.hwid !== hwid) {
    return res.json({ ok: false, message: "HWID غير مطابق" });
  }

  // لو مفتاح غير مربوط → نربطه الآن
  if (!lic.hwid) {
    lic.hwid = hwid;
    saveDB(db);
  }

  return res.json({
    ok: true,
    expiresAt: lic.expiresAt,
    note: lic.note
  });
});

// ============================
// صفحة لوحة التحكم
// ============================

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// ============================
// تشغيل السيرفر
// ============================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`License server running on port ${PORT}`);
});
