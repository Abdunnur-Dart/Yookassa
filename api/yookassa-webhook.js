// Пример серверной логики (Node.js/Firebase Admin SDK)
if (event.type === 'payment.succeeded') {
  const payment = event.object;
  const userId = payment.metadata.user_id;

  if (userId) {
    await admin.firestore().collection('users').doc(userId).set({
      isPremium: true,
      subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
      subscriptionPeriod: payment.metadata.subscription_period,
    }, { merge: true });
  }
}
