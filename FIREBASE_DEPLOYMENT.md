# Cau hinh Firebase Authentication

## Bien moi truong tren Vercel

Them ba bien sau cho Production, Preview va Development neu can:

```text
FIREBASE_PROJECT_ID=storehub-41485
FIREBASE_CLIENT_EMAIL=<gia tri client_email trong service-account JSON>
FIREBASE_PRIVATE_KEY=<gia tri private_key trong service-account JSON>
```

Lay hai gia tri con thieu tai:

```text
Firebase Console
Project settings
Service accounts
Firebase Admin SDK
Generate new private key
```

Trong Vercel, dan toan bo gia tri `private_key`, bao gom ca:

```text
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```

Code server chap nhan ca xuong dong that va chuoi `\n` trong private key.

Sau khi them bien:

1. Redeploy deployment Production moi nhat.
2. Khong can `GOOGLE_WEB_CLIENT_ID` nua.
3. Khong dua service-account JSON hoac private key len GitHub.

## Cau hinh debug cho thanh vien nhom

Moi may thuong co debug keystore va SHA-1 khac nhau.

Tai thu muc du an Android, chay:

```powershell
.\gradlew.bat signingReport
```

Lay SHA1 cua variant `debug`, sau do them tai:

```text
Firebase Console
Project settings
General
Your apps
StoreHub Android
SHA certificate fingerprints
Add fingerprint
```

Sau khi them cac SHA-1 moi:

1. Tai lai `google-services.json`.
2. Thay file `store-hub/app/google-services.json`.
3. Sync Gradle va build lai app.
4. Dung emulator Android 15 API 35 co Google Play hoac may that co Google Play Services.

Khong can tao OAuth Android Client thu cong trong Google Cloud Console. Firebase se quan ly cac client dua tren package va SHA-1.
