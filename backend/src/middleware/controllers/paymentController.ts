import { Request, Response } from 'express'
import * as paymentService from '../../services/paymentService'
import * as userService from '../../services/userService'

export async function initiateConnectAccount(req: Request, res: Response) {
  const userId = (req as any).userId as string

  try {
    const existingAccountId = await userService.getStripeAccountId(userId)
    const { accountId, url } = await paymentService.createConnectAccountLink(existingAccountId)

    if (accountId && accountId !== existingAccountId) {
      await userService.updateStripeAccountId(userId, accountId)
    }

    return res.json({ stripeAccountId: accountId ?? existingAccountId, url })
  } catch (error: any) {
    console.error('Failed to initiate Connect Express:', error)
    return res.status(500).json({ error: error.message || 'Failed to initiate payouts onboarding.' })
  }
}

export async function connectAccountCallback(req: Request, res: Response) {
  const userId = req.query.userId as string
  const status = req.query.status as string

  if (!userId) {
    return res.status(400).send('Missing userId parameter')
  }

  try {
    const accountId = await userService.getStripeAccountId(userId)
    const verification = accountId
      ? await paymentService.getConnectAccountStatus(accountId)
      : { payoutsEnabled: false }

    const isSuccess = status === 'success' && verification.payoutsEnabled

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Zoink — Payout Setup</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800;900&display=swap" rel="stylesheet">
        <style>
          body {
            background-color: #F4EDE1;
            font-family: 'Outfit', sans-serif;
            color: #040F0F;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 24px;
            box-sizing: border-box;
          }
          .container {
            background-color: #FFF9EF;
            border-radius: 32px;
            padding: 48px 32px;
            max-width: 420px;
            width: 100%;
            text-align: center;
            box-shadow: 0 12px 48px rgba(0, 0, 0, 0.08);
          }
          .icon {
            font-size: 64px;
            margin-bottom: 24px;
            animation: bounce 2s infinite ease-in-out;
          }
          h1 {
            font-size: 28px;
            font-weight: 900;
            margin: 0 0 16px 0;
            line-height: 1.2;
          }
          p {
            font-size: 16px;
            color: rgba(4, 15, 15, 0.7);
            line-height: 1.6;
            margin: 0 0 32px 0;
          }
          .btn {
            display: inline-block;
            background-color: #00EF20;
            color: #040F0F;
            text-decoration: none;
            padding: 16px 32px;
            border-radius: 99px;
            font-weight: 800;
            font-size: 16px;
            box-shadow: 0 8px 24px rgba(0, 239, 32, 0.3);
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 32px rgba(0, 239, 32, 0.45);
          }
          .btn-error {
            background-color: #040F0F;
            color: #FFF9EF;
            box-shadow: 0 8px 24px rgba(4, 15, 15, 0.2);
          }
          .btn-error:hover {
            box-shadow: 0 12px 32px rgba(4, 15, 15, 0.35);
          }
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${
            isSuccess
              ? `
            <div class="icon">🎉</div>
            <h1>Payouts Connected!</h1>
            <p>Your Stripe Express account has been set up successfully. You are now ready to accept rental bookings and receive payouts directly to your account.</p>
            <a href="zoink://profile" class="btn">Return to Zoink</a>
          `
              : `
            <div class="icon">⚠️</div>
            <h1>Onboarding Incomplete</h1>
            <p>It looks like you didn't finish submitting all required details to Stripe. Please return to the profile tab in the app and try completing the setup process again.</p>
            <a href="zoink://profile" class="btn btn-error">Return to Zoink</a>
          `
          }
        </div>
      </body>
      </html>
    `

    return res.send(html)
  } catch (error: any) {
    console.error('Callback error:', error)
    return res.status(500).send('Internal Server Error: ' + error.message)
  }
}
