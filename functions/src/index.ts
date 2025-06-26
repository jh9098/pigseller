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
