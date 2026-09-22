-- Enable pgcrypto for credential security
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(15) UNIQUE NOT NULL,
  full_name VARCHAR(100),
  default_address JSONB NOT NULL,
  upi_id VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE linked_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  platform VARCHAR(20) CHECK (platform IN ('amazon', 'flipkart', 'myntra', 'meesho', 'ajio')),
  auth_token TEXT NOT NULL, -- Encrypted Session / OAuth Access Token
  refresh_token TEXT,
  account_email VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

CREATE TABLE order_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  platform VARCHAR(20),
  product_name TEXT NOT NULL,
  price_inr NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'TRIGGERED' CHECK (status IN ('TRIGGERED', 'SUCCESS', 'FAILED')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
