const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  const [, , cafeId, loginIdInput, password, ...nameParts] = process.argv;
  const loginId = loginIdInput?.trim().toLowerCase();
  const cafeName = nameParts.join(' ').trim() || cafeId;

  if (!cafeId || !loginId || !password || !/^[a-z0-9_-]{3,40}$/.test(loginId) || password.length < 8) {
    console.error('Usage: node scripts/seed-admin.js <cafe-id> <user-id> <password> [cafe-name]');
    console.error('User ID: 3-40 lowercase letters, numbers, _ or -; password: minimum 8 characters.');
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const cafe = await prisma.cafe.upsert({
    where: { qrCode: cafeId },
    update: {
      loginId,
      password: hashedPassword,
      ownerName: cafeName
    },
    create: {
      qrCode: cafeId,
      name: cafeName,
      pricingConfig: JSON.stringify({ bw: 2, color: 10 }),
      printerConfig: '{}',
      loginId,
      password: hashedPassword,
      ownerName: cafeName,
      agentSecretKey: `sk_agent_${require('crypto').randomBytes(16).toString('hex')}`
    }
  });

  console.log(`✅ Cafe user created/updated!`);
  console.log(`User ID: ${loginId}`);
  console.log('Password: set successfully (not printed for security)');
  console.log(`Cafe ID: ${cafe.qrCode}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
