'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

function PaymentSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('결제를 승인하고 있습니다...');

  useEffect(() => {
    const confirmPayment = async () => {
      const paymentKey = searchParams.get('paymentKey');
      const orderId = searchParams.get('orderId');
      const amount = Number(searchParams.get('amount'));
      const productId = searchParams.get('productId');

      if (!paymentKey || !orderId || !amount || !productId) {
        setMessage('결제 정보가 올바르지 않습니다. 관리자에게 문의하세요.');
        return;
      }

      try {
        const confirmToss = httpsCallable(functions, 'confirmTossPayment');
        await confirmToss({ paymentKey, orderId, amount, productId });
        setMessage('결제가 성공적으로 완료되었습니다! 3초 후 대시보드로 이동합니다.');
        setTimeout(() => router.push('/dashboard'), 3000);
      } catch (error: any) {
        setMessage(`결제 실패: ${error.message}`);
      }
    };
    confirmPayment();
  }, [searchParams, router]);

  return (
    <div>
      <h1>결제 상태</h1>
      <p>{message}</p>
    </div>
  );
}

export default function PaymentSuccessPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <PaymentSuccessContent />
        </Suspense>
    )
}
