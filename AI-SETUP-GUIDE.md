# AI Feature Setup Guide

This guide explains how to set up the AI features in the Task Joy Box application.

## Prerequisites

- OpenAI API key (optional, for AI features)

## Environment Variables

Add these to your `.env` file:

```env
OPENAI_API_KEY=your_openai_api_key_here  # Optional, for AI features
ENCRYPTION_KEY=your_64_char_hex_key_here  # Required for data encryption
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=sandbox  # or 'live' for production
```

## Database Schema Updates

The following fields have been added to support encrypted payment data:
- `paypal_subscription_id`: Text field for PayPal subscription ID (encrypted)
- `paypal_customer_id`: Text field for PayPal customer ID (encrypted)

## API Endpoints

- `POST /api/ai/analyze-tasks` - Analyze user's tasks and provide recommendations
- `POST /api/ai/get-user-data` - Get user data for AI processing
- `POST /api/ai/pro/insights-analysis` - Get advanced productivity insights (premium users)

## Payment Processing

The application now uses PayPal as the sole payment processor. All sensitive payment data is encrypted using AES-256-GCM encryption algorithm. The following endpoints are available:

- `POST /api/workspace/workspace/:workspaceId/billing/checkout` - Create PayPal checkout session for workspace seats
- `GET /api/workspace/execute-payment` - Execute PayPal payment after approval

### Frontend Changes

#### A. Collaboration Page Updates
- Replaced organization functionality with workspace functionality
- Added Create Workspace form (available to all users)
- Added seat summary display showing used/total seats
- Added billing panel for workspace owners
- Updated invite flow to handle seat limit errors

#### B. Seat Limit Handling
- When API returns 402 SEAT_LIMIT_REACHED, shows a dialog
- Offers to add more seats via checkout flow
- Automatically suggests increasing seat count by 1

### Migration Process
1. Run the migration to add seat fields to the workspaces table
2. Update server routes to include new workspace endpoints
3. Configure Stripe webhook endpoint
4. Update frontend to use new workspace functionality

### API Endpoints Used
- `GET /api/workspace` - Get user's workspace
- `POST /api/workspace` - Create a new workspace
- `POST /api/workspace/invite` - Invite a member to workspace
- `POST /api/workspace/workspace/:workspaceId/billing/checkout` - Create Stripe checkout session

### Webhook Configuration
Configure your Stripe webhook to point to:
- Endpoint: `{APP_URL}/api/workspace/billing/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`