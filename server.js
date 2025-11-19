// server.js
const express = require("express");
const fs = require("fs").promises;
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const DB_FILE = path.join(__dirname, "licenses-db.json");

app.use(express.json());

// تحميل قاعدة البيانات من ملف JSON
async function loadDB() {
  try {
    const data = await fs.readFile(DB_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return { licenses: [] };
  }
}

// حفظ قاعدة البيانات
async function saveDB(db) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

// 🔐 تفعيل / ربط HWID أوتوماتيك
app.post("/api/activate", async (req, res) => {
  const { key, hwid } = req.body || {};

  if (!key || !hwid) {
    return res.status(400).json({
      ok: false,
      errorCode: "BAD_REQUEST",
      message: "مفقود key أو hwid — Missing key or hwid",
    });
  }

  const db = await loadDB();
  const licenseKey = String(key).trim().toLowerCase();

  const lic = db.licenses.find(
    (l) =>
      typeof l.key === "string" &&
      l.key.trim().toLowerCase() === licenseKey
  );

  if (!lic) {
    return res.status(404).json({
      ok: false,
      errorCode: "NOT_FOUND",
      message: "المفتاح غير صحيح — License key not found",
    });
  }

  if (lic.disabled) {
    return res.status(403).json({
      ok: false,
      errorCode: "DISABLED",
      message: "المفتاح مقفّل من المزود — License has been disabled",
    });
  }

  if (lic.expiresAt) {
    const now = new Date();
    const exp = new Date(lic.expiresAt);
    if (now > exp) {
      return res.status(403).json({
        ok: false,
        errorCode: "EXPIRED",
        message: "صلاحية المفتاح انتهت — License has expired",
      });
    }
  }

  // 🔗 Auto HWID Link
  if (!lic.hwid || lic.hwid === null) {
    lic.hwid = hwid; // اربطه أول مرة بهذا الجهاز
    await saveDB(db);
    console.log("🔗 Auto-linked HWID:", hwid, "for key:", lic.key);
  } else if (lic.hwid !== hwid) {
    return res.status(403).json({
      ok: false,
      errorCode: "HWID_MISMATCH",
      message:
        "المفتاح مفعّل على جهاز ثاني — License already used on another device (HWID mismatch)",
    });
  }

  // تفعيل ناجح
  return res.json({
    ok: true,
    errorCode: null,
    message: "تم التفعيل بنجاح — Activated successfully",
    license: {
      key: lic.key,
      hwid: lic.hwid,
      expiresAt: lic.expiresAt || null,
      disabled: lic.disabled || false,
      note: lic.note || null,
    },
  });
});

// لوحة بسيطة ترجع كل المفاتيح (API للـ Dashboard)
app.get("/api/admin/licenses", async (req, res) => {
  const db = await loadDB();
  res.json(db);
});
// إضافة مفتاح جديد
app.post("/api/admin/add", async (req, res) => {
  const { key, expiresAt } = req.body;

  const db = await loadDB();
  db.licenses.push({
    key,
    hwid: null,
    expiresAt,
    disabled: false,
    note: null
  });

  await saveDB(db);
  res.json({ ok: true });
});

// Reset HWID
app.post("/api/admin/reset-hwid", async (req, res) => {
  const { key } = req.body;

  const db = await loadDB();
  const lic = db.licenses.find(l => l.key === key);

  if (lic) {
    lic.hwid = null;
    await saveDB(db);
  }
  res.json({ ok: true });
});

// Disable / Enable
app.post("/api/admin/toggle-disable", async (req, res) => {
  const { key } = req.body;

  const db = await loadDB();
  const lic = db.licenses.find(l => l.key === key);

  if (lic) {
    lic.disabled = !lic.disabled;
    await saveDB(db);
  }
  res.json({ ok: true });
});

// Delete key
app.post("/api/admin/delete", async (req, res) => {
  const { key } = req.body;

  let db = await loadDB();
  db.licenses = db.licenses.filter(l => l.key !== key);

  await saveDB(db);
  res.json({ ok: true });
});

// عرض Dashboard
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.listen(PORT, () => {
  console.log(`License server running on http://localhost:${PORT}`);
});
