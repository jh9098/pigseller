최종 아키텍처 요약
프론트엔드 (Frontend): Next.js → Netlify 배포
백엔드 (Backend): Firebase
인증 (Authentication): 이메일/비밀번호 로그인
데이터베이스 (Firestore): 판매자, 상품, 결제 데이터 저장
스토리지 (Storage): 상품 이미지 저장
서버리스 함수 (Cloud Functions): 사업자 인증, 결제 승인, 관리자 권한 부여 등 보안 로직 처리
🚀 Phase 0: 프로젝트 환경 설정 (가장 먼저 할 일)
전체 프로젝트 폴더 생성
```
mkdir my-seller-project
cd my-seller-project
```

Firebase CLI 설치 및 로그인
```
npm install -g firebase-tools
firebase login
```

백엔드 (Firebase Functions) 초기화
```
firebase init functions
```
Use an existing project → pigseller-8ebba 선택
TypeScript 선택
ESLint → Yes
install dependencies → Yes
프론트엔드 (Next.js) 초기화
```
# my-seller-project 최상위 폴더에서 실행
npx create-next-app@latest frontend
```
TypeScript, ESLint, Tailwind CSS, App Router 등 추천 옵션을 Yes로 선택합니다.
환경 변수 설정 (가장 중요!)
프론트엔드 (frontend/.env.local 파일 생성 및 작성):
```
# Firebase Config - Firebase 콘솔 > 프로젝트 설정 > 일반 탭에서 복사
NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSyAxAJMlOfi9RFsvLlSsyYQg_PGX-ZJHJ50"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="pigseller-8ebba.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="pigseller-8ebba"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="pigseller-8ebba.appspot.com"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="485496498120"
NEXT_PUBLIC_FIREBASE_APP_ID="1:485496498120:web:fa58f127b016a6155082fd"
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="G-B06CZYRT77"

# Toss Payments Client Key (공개 가능)
NEXT_PUBLIC_TOSS_CLIENT_KEY="test_ck_AQ92ymxN34RPPqd5b55OrajRKXvd"
```
백엔드 (Cloud Functions 환경 변수 설정):
functions 폴더로 이동 후, 터미널에서 아래 명령어를 실행합니다. 이 키는 절대 코드에 넣지 마세요.
```
cd functions
firebase functions:config:set toss.secret_key="test_sk_Gv6LjeKD8azmjDjEMjX43wYxAdXy"
# 참고: 나중에 Codef API를 사용한다면 아래처럼 추가합니다.
# firebase functions:config:set codef.api_key="YOUR_CODEF_API_KEY"
```
🔑 Phase 1: 백엔드 및 보안 규칙 전체 코드
1. Firestore 보안 규칙 (firestore.rules)
이 내용을 Firebase 콘솔의 Firestore Database > 규칙 탭에 붙여넣고 게시하세요. 관리자(admin)만 상품 상태를 수정할 수 있도록 강화되었습니다.
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 판매자 정보: 본인만 읽고 쓸 수 있고, 관리자는 모든 정보를 읽을 수 있다.
    match /sellers/{sellerId} {
      allow read, update: if request.auth != null && request.auth.uid == sellerId;
      allow create: if request.auth != null;
      // 관리자는 모든 판매자 정보를 읽을 수 있음 (관리자 페이지용)
      allow get: if request.auth.token.admin == true;
    }

    // 상품 정보: 로그인 사용자는 읽기 가능.
    // 생성은 본인만 가능.
    // 업데이트는 관리자만 가능.
    match /products/{productId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.sellerId == request.auth.uid;
      allow update: if request.auth.token.admin == true;
    }

    // 결제 정보: 본인만 생성하고 읽을 수 있다.
    match /payments/{paymentId} {
        allow read, create: if request.auth != null && request.resource.data.sellerId == request.auth.uid;
    }
  }
}
```
2. Firebase Cloud Functions (functions/src/index.ts)
functions 폴더에서 npm install axios를 실행한 후, 아래 코드로 functions/src/index.ts 파일 전체를 교체하세요.
```typescript
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();
const db = admin.firestore();

// 환경 변수 로드
const TOSS_SECRET_KEY = functions.config().toss.secret_key;
const SEOUL_REGION = "asia-northeast3";

// 1. 사업자 인증 함수 (현재는 무조건 성공)
export const verifyBusinessNumber = functions
  .region(SEOUL_REGION)
  .https.onCall(async (data, context) => {
    // Codef 같은 실제 사업자 인증 API 연동 시 아래 주석 해제 후 사용
    // const { businessNumber, representativeName } = data;
    // try {
    //   const response = await axios.post("CODEF_API_ENDPOINT", { ... });
    //   return { isVerified: response.data.isSuccess };
    // } catch (error) {
    //   throw new functions.https.HttpsError("internal", "사업자 정보 인증에 실패했습니다.");
    // }
    console.log("사업자 인증 요청 받음:", data);
    return {isVerified: true}; // 개발 편의를 위해 임시로 무조건 성공 처리
  });

// 2. 토스페이먼츠 결제 승인 함수
export const confirmTossPayment = functions
  .region(SEOUL_REGION)
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const {paymentKey, orderId, amount, productId} = data;
    const sellerId = context.auth.uid;

    // !!중요: 실제 서비스에서는 DB에서 productId로 상품 가격을 조회하여
    // amount와 일치하는지 반드시 검증해야 합니다. (가격 변조 방지)
    const productRef = db.collection("products").doc(productId);
    const productDoc = await productRef.get();
    if (!productDoc.exists) {
      throw new functions.https.HttpsError("not-found", "상품 정보를 찾을 수 없습니다.");
    }
    // const productPrice = productDoc.data()?.price; // 실제 가격 검증 로직 추가
    // if(amount !== productPrice) { ... }

    const basicToken = Buffer.from(`${TOSS_SECRET_KEY}:`).toString("base64");

    try {
      const response = await axios.post(
        "https://api.tosspayments.com/v1/payments/confirm",
        {paymentKey, orderId, amount},
        {headers: {Authorization: `Basic ${basicToken}`}},
      );

      if (response.data.status === "DONE") {
        // 1. 우리 DB에 결제 정보 저장
        await db.collection("payments").add({
          sellerId,
          productId,
          amount: response.data.totalAmount,
          tossPaymentKey: paymentKey,
          orderId,
          status: "PAID",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // 2. 결제가 완료된 상품의 상태를 'live'(모집중)으로 변경
        await productRef.update({ status: 'live' });
        
        return {success: true, paymentData: response.data};
      } else {
        throw new functions.https.HttpsError("aborted", "결제 승인에 실패했습니다.");
      }
    } catch (error: any) {
      console.error("Toss Payment Error:", error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || "결제 처리 중 오류가 발생했습니다.";
      throw new functions.https.HttpsError("internal", errorMessage);
    }
  });

// 3. 관리자 권한 부여 함수
export const setAdminClaim = functions
  .region(SEOUL_REGION)
  .https.onCall(async (data, context) => {
    // 이 함수를 호출하는 사용자가 이미 관리자인지 확인 (보안 강화)
    if (context.auth?.token.admin !== true) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "관리자만 이 기능을 사용할 수 있습니다."
      );
    }
    const {email} = data;
    try {
      const user = await admin.auth().getUserByEmail(email);
      await admin.auth().setCustomUserClaims(user.uid, {admin: true});
      return {message: `${email} 님을 관리자로 지정했습니다.`};
    } catch (error) {
      console.error(error);
      throw new functions.https.HttpsError("internal", "사용자를 찾지 못했거나 오류가 발생했습니다.");
    }
  });
```
💻 Phase 2: 프론트엔드 전체 코드 (frontend/ 폴더)
먼저 필요한 라이브러리를 설치합니다.
```
cd frontend
npm install firebase react-firebase-hooks react-hook-form @tosspayments/payment-widget-sdk uuid
npm install -D @types/uuid
```
1. Firebase 초기 설정 (frontend/src/lib/firebase.ts)
```typescript
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Firebase 앱 초기화
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "asia-northeast3");

// 로컬 개발 시 에뮬레이터 연결 (선택사항)
// if (process.env.NODE_ENV === 'development') {
//   connectFunctionsEmulator(functions, "localhost", 5001);
// }
```
2. 결제 버튼 컴포넌트 (frontend/src/components/PaymentButton.tsx)
frontend/src 폴더 아래에 components 폴더를 만들고 이 파일을 추가합니다.
```tsx
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
        console.error("결제 위젯 로딩 실패", error);
      }
    };
    fetchWidget();
  }, [user, orderId]);

  const handlePayment = async () => {
    const paymentWidget = paymentWidgetRef.current;
    if (!paymentWidget) {
      alert("결제 위젯이 로딩되지 않았습니다.");
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
      console.error("결제 요청 실패", error);
    }
  };

  return <button onClick={handlePayment}>결제하고 캠페인 시작하기</button>;
}
```
3. 회원가입 페이지 (frontend/src/app/auth/signup/page.tsx)
```tsx
'use client';
import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const verifyBusiness = httpsCallable(functions, 'verifyBusinessNumber');
      const result: any = await verifyBusiness({ businessNumber });

      if (!result.data.isVerified) {
        throw new Error('유효하지 않은 사업자 정보입니다.');
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, 'sellers', user.uid), {
        email: user.email,
        businessNumber: businessNumber,
        isVerified: true,
        createdAt: serverTimestamp(),
      });

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || '회원가입에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h1>판매자 회원가입</h1>
      <form onSubmit={handleSignUp}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" required />
        <input type="text" value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} placeholder="사업자등록번호" required />
        <button type="submit" disabled={isLoading}>{isLoading ? '가입 중...' : '가입하기'}</button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
    </div>
  );
}
```
4. 로그인 페이지 (frontend/src/app/auth/login/page.tsx)
```tsx
'use client';
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>로그인</h1>
      <form onSubmit={handleLogin}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" required />
        <button type="submit">로그인</button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
      <p>계정이 없으신가요? <Link href="/auth/signup">회원가입</Link></p>
    </div>
  );
}
```
5. 결제 성공 페이지 (frontend/src/app/payment/success/page.tsx)
```tsx
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
```
6. 상품 등록 페이지 (frontend/src/app/products/register/page.tsx)
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';

type ProductInputs = {
  name: string;
  description: string;
  price: number;
  productImage: FileList;
};

export default function RegisterProductPage() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProductInputs>();
  const [formError, setFormError] = useState('');

  if (loading) return <p>로딩 중...</p>;
  if (!user) {
    router.push('/auth/login');
    return null;
  }

  const onSubmit: SubmitHandler<ProductInputs> = async (data) => {
    setFormError('');
    if (!data.productImage || data.productImage.length === 0) {
      setFormError('상품 이미지를 등록해주세요.');
      return;
    }

    try {
      const imageFile = data.productImage[0];
      const storageRef = ref(storage, `products/${user.uid}/${Date.now()}_${imageFile.name}`);
      const uploadResult = await uploadBytes(storageRef, imageFile);
      const imageUrl = await getDownloadURL(uploadResult.ref);

      await addDoc(collection(db, 'products'), {
        sellerId: user.uid,
        name: data.name,
        description: data.description,
        price: Number(data.price),
        imageUrl: imageUrl,
        status: 'pending', // 초기 상태: 승인대기
        createdAt: serverTimestamp(),
      });

      alert('상품이 성공적으로 등록되었습니다. 관리자 승인 후 결제가 가능합니다.');
      router.push('/dashboard');

    } catch (err: any) {
      setFormError('상품 등록 중 오류 발생: ' + err.message);
    }
  };

  return (
    <div>
      <h1>상품 등록</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label htmlFor="name">상품명</label>
          <input id="name" {...register('name', { required: '상품명은 필수입니다.' })} />
          {errors.name && <p style={{ color: 'red' }}>{errors.name.message}</p>}
        </div>
        <div>
          <label htmlFor="description">상품 설명</label>
          <textarea id="description" {...register('description', { required: '상품 설명은 필수입니다.' })} />
          {errors.description && <p style={{ color: 'red' }}>{errors.description.message}</p>}
        </div>
        <div>
          <label htmlFor="price">결제 금액 (숫자만 입력)</label>
          <input id="price" type="number" {...register('price', { required: '가격은 필수입니다.', valueAsNumber: true })} />
          {errors.price && <p style={{ color: 'red' }}>{errors.price.message}</p>}
        </div>
        <div>
          <label htmlFor="productImage">대표 이미지</label>
          <input id="productImage" type="file" accept="image/*" {...register('productImage', { required: '이미지는 필수입니다.' })} />
          {errors.productImage && <p style={{ color: 'red' }}>{errors.productImage.message}</p>}
        </div>
        {formError && <p style={{ color: 'red' }}>{formError}</p>}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '등록 중...' : '상품 등록하기'}
        </button>
      </form>
    </div>
  );
}
```
7. 판매자 대시보드 (frontend/src/app/dashboard/page.tsx)
```tsx
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot, DocumentData, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { PaymentButton } from '@/components/PaymentButton';
import { v4 as uuidv4 } from 'uuid';

interface Product {
  id: string;
  name: string;
  price: number;
  status: 'pending' | 'approved' | 'live' | 'closed';
  createdAt: Timestamp;
}

export default function DashboardPage() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/auth/login');
      return;
    }

    const q = query(collection(db, 'products'), where('sellerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const productsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Product));
      setProducts(productsData);
      setIsLoadingProducts(false);
    }, (error) => {
        console.error("상품 데이터 로딩 오류:", error);
        setIsLoadingProducts(false);
    });

    return () => unsubscribe();
  }, [user, loading, router]);
  
  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '승인 대기중';
      case 'approved': return '결제 대기중';
      case 'live': return '캠페인 진행중';
      case 'closed': return '마감';
      default: return '알 수 없음';
    }
  };

  if (loading || isLoadingProducts) return <p>데이터를 불러오는 중입니다...</p>;

  return (
    <div>
      <h1>내 상품 관리 대시보드</h1>
      <button onClick={() => router.push('/products/register')}>+ 새 상품 등록하기</button>
      <hr />
      {products.length === 0 ? (<p>등록된 상품이 없습니다.</p>) : (
        <table>
          <thead>
            <tr><th>상품명</th><th>가격</th><th>등록일</th><th>상태</th><th>액션</th></tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td>{product.price.toLocaleString()}원</td>
                <td>{product.createdAt.toDate().toLocaleDateString()}</td>
                <td>{getStatusText(product.status)}</td>
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
      )}
    </div>
  );
}
```
8. 관리자 대시보드 (frontend/src/app/admin/dashboard/page.tsx)
```tsx
'use client';
import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, DocumentData, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useRouter } from 'next/navigation';

interface Product extends DocumentData {
  id: string;
  name: string;
  sellerId: string;
  status: 'pending' | 'approved' | 'live' | 'closed';
  createdAt: Timestamp;
}

export default function AdminDashboardPage() {
  const [user, loading] = useAuthState(auth);
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/auth/login');
      return;
    }

    // 사용자 토큰에서 admin 클레임 확인
    user.getIdTokenResult().then((idTokenResult) => {
      if (idTokenResult.claims.admin) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    });

  }, [user, loading, router]);


  useEffect(() => {
    if (isAdmin === false) return; // 관리자가 아니면 데이터 로드 안함
    if (isAdmin === true) {
      const q = query(collection(db, 'products'));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const productsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as Product));
        setProducts(productsData);
        setIsLoading(false);
      });
      return () => unsubscribe();
    }
  }, [isAdmin]);

  const handleStatusChange = async (productId: string, newStatus: string) => {
    try {
      const productRef = doc(db, 'products', productId);
      await updateDoc(productRef, { status: newStatus });
      alert('상태가 성공적으로 변경되었습니다.');
    } catch (error) {
      alert('상태 변경 중 오류가 발생했습니다.');
    }
  };

  if (loading || isAdmin === null) return <p>권한을 확인하는 중입니다...</p>;
  if (isAdmin === false) return <p>접근 권한이 없습니다.</p>;
  if (isLoading) return <p>관리자 데이터를 불러오는 중입니다...</p>;

  return (
    <div>
      <h1>(관리자) 전체 상품 관리</h1>
      <table>
        <thead>
          <tr><th>상품명</th><th>판매자 ID</th><th>등록일</th><th>현재 상태</th><th>상태 변경</th></tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{product.sellerId.substring(0, 10)}...</td>
              <td>{product.createdAt.toDate().toLocaleDateString()}</td>
              <td>{product.status}</td>
              <td>
                <select 
                  value={product.status} 
                  onChange={(e) => handleStatusChange(product.id, e.target.value)}
                >
                  <option value="pending">승인 대기</option>
                  <option value="approved">승인 완료</option>
                  <option value="closed">마감</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```
🚀 Phase 3: 배포 및 최종 설정
백엔드 배포 (Firebase)
functions 폴더에서 아래 명령어를 실행하여 함수와 Firestore 규칙을 배포합니다.
```
# functions 폴더 안에서 실행
firebase deploy --only functions,firestore:rules
```
관리자 지정: 배포 후, Firebase 콘솔의 Cloud Functions 메뉴에서 setAdminClaim 함수를 테스트 실행하거나, 별도의 관리 도구를 만들어 이메일을 인자로 호출하면 해당 유저에게 관리자 권한이 부여됩니다. (예: { "email": "admin-user@example.com" })
프론트엔드 배포 (Netlify)
먼저, 모든 코드를 GitHub 저장소에 푸시합니다.
Netlify에 로그인하여 Add new site > Import an existing project 선택.
GitHub를 선택하고 프로젝트 저장소를 연결합니다.
Build Settings (빌드 설정) - 가장 중요!
Base directory: frontend
Build command: npm run build
Publish directory: frontend/.next
Environment variables (환경 변수):
Build & deploy > Environment 메뉴로 이동합니다.
frontend/.env.local 파일에 있던 NEXT_PUBLIC_... 으로 시작하는 모든 변수들을 똑같은 이름과 값으로 추가해줍니다.
Deploy site 버튼을 클릭하여 배포를 시작합니다.
이것으로 실제 운영 가능한 판매자 페이지의 전체 구조와 코드가 완성되었습니다. 각 페이지의 UI/UX를 다듬고, 세부적인 비즈니스 로직을 추가하면 훌륭한 결과물이 될 것입니다.
