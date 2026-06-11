/**
 * Test amaçlı: ayse@demo.com için 2FA'yı BİLİNEN bir secret ile etkinleştirir.
 * Sunucudaki özel TOTP algoritması (security.service.ts) birebir kopyalandı,
 * çünkü standart authenticator uygulamaları bu implementasyonla uyumlu değil.
 *
 * Kullanım:
 *   node scripts/setup-2fa-test.js          -> 2FA'yı kurar, secret + yedek kodları + güncel kodu basar
 *   node scripts/setup-2fa-test.js code      -> sadece o anki geçerli 6 haneli kodu basar
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const EMAIL = 'ayse@demo.com';
// Sabit, bilinen secret (32 base32 karakter).
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
// Sabit, bilinen 10 yedek kod.
const BACKUP_CODES = [
  'AAAA-1111', 'BBBB-2222', 'CCCC-3333', 'DDDD-4444', 'EEEE-5555',
  'FFFF-6666', 'GGGG-7777', 'HHHH-8888', 'IIII-9999', 'JJJJ-0000',
];

// --- security.service.ts ile birebir aynı algoritma ---
function generateTOTPCode(secret, time) {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const secretBytes = [];
  for (const char of secret.toUpperCase()) {
    const idx = base32Chars.indexOf(char);
    if (idx >= 0) secretBytes.push(idx);
  }
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha1', Buffer.from(secretBytes));
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(time));
  hmac.update(timeBuffer);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0xf;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  return (binary % 1000000).toString().padStart(6, '0');
}

function currentCode() {
  const time = Math.floor(Date.now() / 1000 / 30);
  return generateTOTPCode(SECRET, time);
}

async function main() {
  if (process.argv[2] === 'code') {
    console.log(currentCode());
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!user) {
    console.error(`Kullanıcı bulunamadı: ${EMAIL}`);
    process.exit(1);
  }

  const encryptedSecret = Buffer.from(SECRET).toString('base64'); // = encryptSecret()
  const hashedBackupCodes = await Promise.all(BACKUP_CODES.map((c) => bcrypt.hash(c, 10)));

  await prisma.twoFactorSecret.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      secret: encryptedSecret,
      backupCodes: hashedBackupCodes,
      isEnabled: true,
    },
    update: {
      secret: encryptedSecret,
      backupCodes: hashedBackupCodes,
      isEnabled: true,
    },
  });

  // twoFactorEnabled yalnızca AdminUser modelinde; normal kullanıcıda 2FA gerçeği
  // TwoFactorSecret.isEnabled'dır. Servisle aynı şekilde admin satırını da güncelle
  // (ayse admin değilse no-op).
  await prisma.adminUser.updateMany({
    where: { userId: user.id },
    data: { twoFactorEnabled: true },
  });

  console.log('✅ 2FA etkinleştirildi: ' + EMAIL);
  console.log('');
  console.log('Secret (base32):  ' + SECRET);
  console.log('Şu anki kod:      ' + currentCode() + '   (30 sn geçerli)');
  console.log('');
  console.log('Yedek kodlar (10):');
  BACKUP_CODES.forEach((c) => console.log('  ' + c));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
