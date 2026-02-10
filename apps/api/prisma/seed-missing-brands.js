const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const brandsToAdd = [
        { name: 'Matchbox', slug: 'matchbox', country: 'UK', description: 'Dünyanın en ikonik diecast markalarından biri.' },
        { name: 'Tomica', slug: 'tomica', country: 'Japan', description: 'Japonya\'nın en büyük model araba üreticisi.' },
        { name: 'M2 Machines', slug: 'm2-machines', country: 'USA', description: 'Amerikan otomobil kültürünü yansıtan detaylı modeller.' },
        { name: 'Greenlight', slug: 'greenlight', country: 'USA', description: 'Film ve dizi araçları ile tanınan üretici.' },
        { name: 'Jada Toys', slug: 'jada-toys', country: 'USA', description: 'Modern modifiye ve sokak kültürü modelleri.' },
        { name: 'Solido', slug: 'solido', country: 'France', description: 'Klasik Avrupa otomobilleri üzerine uzmanlaşmış Fransız marka.' },
        { name: 'GT Spirit', slug: 'gt-spirit', country: 'France', description: 'Yüksek kaliteli reçine modeller.' },
        { name: 'BBR', slug: 'bbr', country: 'Italy', description: 'Lüks ve nadir otomobil modelleri.' },
    ];

    console.log('Eksik markalar ekleniyor...');

    for (const brand of brandsToAdd) {
        await prisma.brand.upsert({
            where: { slug: brand.slug },
            update: {},
            create: {
                ...brand,
                isActive: true,
                sortOrder: 50
            }
        });
    }

    console.log('Markalar başarıyla eklendi.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
