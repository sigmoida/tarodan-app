import { NextRequest, NextResponse } from 'next/server';

/**
 * Handle iyzico callback (POST request from iyzico)
 * IMPORTANT: Use 303 status to force GET redirect (POST -> GET)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const token = formData.get('token') as string;
    const paymentId = request.nextUrl.searchParams.get('paymentId') || '';
    const isMembership = request.nextUrl.searchParams.get('type') === 'membership';

    const origin = request.nextUrl.origin || 'http://localhost:3000';
    
    if (token) {
      try {
        // Verify payment with backend
        const verifyResponse = await fetch('http://localhost:3001/api/payments/iyzico/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, paymentId }),
        });

        const result = await verifyResponse.json();

        if (result.success || result.status === 'success') {
          // Üyelik ödemesi → membership success sayfasına, değilse sipariş success
          const successPath = isMembership ? '/membership/success' : `/payment/success?paymentId=${paymentId}&guest=true`;
          return NextResponse.redirect(new URL(successPath, origin), 303);
        } else {
          return NextResponse.redirect(new URL(`/payment/fail?paymentId=${paymentId}&error=${encodeURIComponent(result.message || 'Ödeme başarısız')}&guest=true`, origin), 303);
        }
      } catch (verifyError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[IYZICO CALLBACK] Verify error');
        }
        // On verification error, redirect to fail page
        return NextResponse.redirect(new URL(`/payment/fail?paymentId=${paymentId}&error=${encodeURIComponent('Ödeme doğrulanamadı')}&guest=true`, origin), 303);
      }
    }

    return NextResponse.redirect(new URL('/payment/fail?error=Token%20bulunamadı&guest=true', origin), 303);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[IYZICO CALLBACK] Error');
    }
    return NextResponse.redirect('http://localhost:3000/payment/fail?error=İşlem%20hatası&guest=true', 303);
  }
}

export async function GET(request: NextRequest) {
  const paymentId = request.nextUrl.searchParams.get('paymentId');
  const isMembership = request.nextUrl.searchParams.get('type') === 'membership';
  const origin = request.nextUrl.origin || 'http://localhost:3000';

  if (paymentId) {
    const successPath = isMembership ? '/membership/success' : `/payment/success?paymentId=${paymentId}&guest=true`;
    return NextResponse.redirect(new URL(successPath, origin));
  }
  return NextResponse.redirect(new URL('/payment/fail?error=Geçersiz%20istek&guest=true', origin));
}
