const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function seed() {
    const brands = await p.brand.findMany();
    console.log('Brands found:', brands.map(b => b.slug).join(', '));

    const brandMap = {};
    brands.forEach(b => { brandMap[b.slug] = b.id; });

    const models = [
        { bSlug: 'minichamps', name: 'BMW M3 E30', slug: 'bmw-m3-e30', ys: 1986, ye: 1991, desc: 'Efsanevi BMW M3 ilk nesli.' },
        { bSlug: 'minichamps', name: 'BMW M3 E46', slug: 'bmw-m3-e46', ys: 2000, ye: 2006, desc: 'S54 motorlu ucuncu nesil M3.' },
        { bSlug: 'minichamps', name: 'Porsche 911 (993)', slug: 'porsche-911-993', ys: 1993, ye: 1998, desc: 'Son hava sogutmali 911.' },
        { bSlug: 'autoart', name: 'Lamborghini Aventador', slug: 'lamborghini-aventador', ys: 2011, ye: 2022, desc: 'V12 motorlu Italyan super otomobil.' },
        { bSlug: 'autoart', name: 'Nissan GT-R R35', slug: 'nissan-gt-r-r35', ys: 2007, ye: null, desc: 'Godzilla lakipli Japon super otomobil.' },
        { bSlug: 'autoart', name: 'McLaren 720S', slug: 'mclaren-720s', ys: 2017, ye: 2024, desc: 'McLaren Super Series super otomobil.' },
        { bSlug: 'bburago', name: 'Ferrari F40', slug: 'ferrari-f40', ys: 1987, ye: 1992, desc: 'Twin-turbo V8 efsanesi.' },
        { bSlug: 'bburago', name: 'Ferrari 488 GTB', slug: 'ferrari-488-gtb', ys: 2015, ye: 2019, desc: 'Twin-turbo V8 spor otomobil.' },
        { bSlug: 'bburago', name: 'Mercedes-AMG GT', slug: 'mercedes-amg-gt', ys: 2014, ye: 2024, desc: 'AMG grand tourer.' },
        { bSlug: 'maisto', name: 'Ford Mustang GT', slug: 'ford-mustang-gt', ys: 2015, ye: null, desc: 'Amerikan muscle car ikonu.' },
        { bSlug: 'maisto', name: 'Chevrolet Corvette Stingray', slug: 'chevrolet-corvette-stingray', ys: 2020, ye: null, desc: 'C8 orta motorlu Corvette.' },
        { bSlug: 'hot-wheels', name: 'Twin Mill', slug: 'twin-mill', ys: 1969, ye: null, desc: 'Ikonik cift motorlu fantasy otomobil.' },
        { bSlug: 'hot-wheels', name: 'Bone Shaker', slug: 'bone-shaker', ys: 2006, ye: null, desc: 'Hot Rod tarzi koleksiyoncu favorisi.' },
        { bSlug: 'cmc', name: 'Mercedes-Benz 300 SLR', slug: 'mercedes-benz-300-slr', ys: 1955, ye: 1955, desc: 'Mille Miglia efsanesi.' },
        { bSlug: 'cmc', name: 'Ferrari 250 GTO', slug: 'ferrari-250-gto', ys: 1962, ye: 1964, desc: 'Dunyanin en degerli otomobillerinden biri.' },
        { bSlug: 'kyosho', name: 'Toyota 2000GT', slug: 'toyota-2000gt', ys: 1967, ye: 1970, desc: 'Japonyanin ilk super otomobili.' },
        { bSlug: 'kyosho', name: 'Mazda RX-7 FD3S', slug: 'mazda-rx-7-fd3s', ys: 1992, ye: 2002, desc: 'Rotary motorlu Japon efsanesi.' },
        { bSlug: 'norev', name: 'Citroen DS', slug: 'citroen-ds', ys: 1955, ye: 1975, desc: 'Fransiz otomotiv tasariminin sembol araci.' },
        { bSlug: 'norev', name: 'Renault Alpine A110', slug: 'renault-alpine-a110', ys: 2017, ye: null, desc: 'Modern Fransiz spor otomobili.' },
    ];

    for (const m of models) {
        const brandId = brandMap[m.bSlug];
        if (!brandId) {
            console.log('SKIP - brand not found:', m.bSlug);
            continue;
        }
        await p.carModel.upsert({
            where: { slug: m.slug },
            update: { name: m.name, yearStart: m.ys, yearEnd: m.ye, description: m.desc },
            create: {
                brandId: brandId,
                name: m.name,
                slug: m.slug,
                yearStart: m.ys,
                yearEnd: m.ye,
                description: m.desc,
                isActive: true,
            },
        });
        console.log('OK:', m.name);
    }
    const count = await p.carModel.count();
    console.log('Total car models:', count);
    await p.$disconnect();
}

seed().catch(e => { console.error(e); p.$disconnect(); });
