'use client';

import { useEffect, useRef } from 'react';
import { loadPaymentWidget, PaymentWidgetInstance } from '@tosspayments/payment-widget-sdk';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';

const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!;

interface Props {
  price: number;
  orderId: string;
  orderName: string;
  productId: string;
}

export function PaymentButton({ price, orderId, orderName, productId }: Props) {
  const [user] = useAuthState(auth);
  const paymentWidgetRef = useRef<PaymentWidgetInstance | null>(null);

  useEffect(() => {
    const fetchWidget = async () => {
      try {
        const paymentWidget = await loadPaymentWidget(clientKey, user?.uid || orderId); // customerKey
        paymentWidgetRef.current = paymentWidget;
      } catch (error) {
        console.error('결제 위젯 로딩 실패', error);
      }
    };
    fetchWidget();
  }, [user, orderId]);

  const handlePayment = async () => {
    const paymentWidget = paymentWidgetRef.current;
    if (!paymentWidget) {
      alert('결제 위젯이 로딩되지 않았습니다.');
      return;
    }
    try {
      await paymentWidget.requestPayment({
        orderId,
        orderName,
        successUrl: `${window.location.origin}/payment/success?productId=${productId}`,
        failUrl: `${window.location.origin}/payment/fail`,
        customerEmail: user?.email,
        customerName: user?.displayName || '판매자',
      });
    } catch (error) {
      console.error('결제 요청 실패', error);
    }
  };

  return <button onClick={handlePayment}>결제하고 캠페인 시작하기</button>;
}
