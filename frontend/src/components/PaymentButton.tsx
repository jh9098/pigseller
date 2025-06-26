'use client'
import { useEffect } from 'react'

export interface PaymentButtonProps {
  price: number
  orderId: string
  orderName: string
  productId: string
}

export function PaymentButton({ price, orderId, orderName, productId }: PaymentButtonProps) {
  useEffect(() => {
    // placeholder for initializing TossPayments widget
  }, [])

  const handleClick = async () => {
    // Here we would integrate TossPayments requestPayment logic
    // successUrl must include the productId so we can confirm on success page
    const successUrl = `${window.location.origin}/payment/success?paymentKey={paymentKey}&orderId=${orderId}&amount=${price}&productId=${productId}`
    alert('결제 기능은 구현되지 않았습니다. 성공 URL: ' + successUrl)
  }

  return (
    <button onClick={handleClick}>결제하기</button>
  )
}
