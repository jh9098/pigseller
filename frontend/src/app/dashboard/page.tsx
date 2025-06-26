'use client'
import { useState } from 'react'
import { PaymentButton } from '@/components/PaymentButton'
import { v4 as uuidv4 } from 'uuid'

interface Product {
  id: string
  name: string
  price: number
  status: string
}

// Example data - in reality this would come from Firestore
const products: Product[] = [
  { id: 'p1', name: '샘플 상품', price: 1000, status: 'approved' },
]

export default function DashboardPage() {
  const [items] = useState(products)

  return (
    <div>
      <h1>내 상품 관리 대시보드</h1>
      <table>
        <thead>
          <tr>
            <th>상품명</th>
            <th>가격</th>
            <th>상태</th>
            <th>액션</th>
          </tr>
        </thead>
        <tbody>
          {items.map(product => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{product.price}</td>
              <td>{product.status}</td>
              <td>
                {product.status === 'approved' && (
                  <PaymentButton
                    price={product.price}
                    orderId={uuidv4()}
                    orderName={product.name}
                    productId={product.id}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
