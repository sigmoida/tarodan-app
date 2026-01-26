import { NextRequest, NextResponse } from 'next/server';

/**
 * Handle iyzico callback (POST request from iyzico)
 * IMPORTANT: Use 303 status to force GET redirect (POST -> GET)
 */
export async function POST(request: NextRequest) {
  console.log('[IYZICO CALLBACK] Received POST request');
  
  try {
    const formData = await request.formData();
    const token = formData.get('token') as string;
    const paymentId = request.nextUrl.searchParams.get('paymentId') || '';
    
    console.log('[IYZICO CALLBACK] Token:', token);
    console.log('[IYZICO CALLBACK] PaymentId:', paymentId);

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
        console.log('[IYZICO CALLBACK] Verify result:', result);

        if (result.success || result.status === 'success') {
          // Use 303 to force GET request
          return NextResponse.redirect(new URL(`/payment/success?paymentId=${paymentId}&guest=true`, origin), 303);
        } else {
          return NextResponse.redirect(new URL(`/payment/fail?paymentId=${paymentId}&error=${encodeURIComponent(result.message || 'Ödeme başarısız')}&guest=true`, origin), 303);
        }
      } catch (verifyError) {
        console.error('[IYZICO CALLBACK] Verify error:', verifyError);
        // On verification error, redirect to fail page
        return NextResponse.redirect(new URL(`/payment/fail?paymentId=${paymentId}&error=${encodeURIComponent('Ödeme doğrulanamadı')}&guest=true`, origin), 303);
      }
    }

    return NextResponse.redirect(new URL('/payment/fail?error=Token%20bulunamadı&guest=true', origin), 303);
  } catch (error) {
    console.error('[IYZICO CALLBACK] Error:', error);
    return NextResponse.redirect('http://localhost:3000/payment/fail?error=İşlem%20hatası&guest=true', 303);
  }
}

export async function GET(request: NextRequest) {
  const paymentId = request.nextUrl.searchParams.get('paymentId');
  const origin = request.nextUrl.origin || 'http://localhost:3000';

  if (paymentId) {
    return NextResponse.redirect(new URL(`/payment/success?paymentId=${paymentId}&guest=true`, origin));
  }
  return NextResponse.redirect(new URL('/payment/fail?error=Geçersiz%20istek&guest=true', origin));
}
