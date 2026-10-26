// TẠM THỜI VIẾT TAY theo docs/contracts/bill-split-api.md để frontend code song song với database.
// Agent supabase sẽ thay file này bằng bản sinh tự động: npm run db:types
// Bản sinh tự động phải tương đương về Args và Returns của từng hàm.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bs_create_group: {
        Args: { p_member_names: string[]; p_name: string }
        Returns: Json
      }
      bs_delete_expense: {
        Args: { p_expense_id: string; p_token: string }
        Returns: Json
      }
      bs_delete_group: {
        Args: { p_token: string }
        Returns: undefined
      }
      bs_delete_member: {
        Args: { p_member_id: string; p_token: string }
        Returns: Json
      }
      bs_delete_settlement: {
        Args: { p_settlement_id: string; p_token: string }
        Returns: Json
      }
      bs_get_group: {
        Args: { p_token: string }
        Returns: Json
      }
      bs_get_groups: {
        Args: { p_tokens: string[] }
        Returns: Json
      }
      bs_rotate_token: {
        Args: { p_token: string }
        Returns: Json
      }
      bs_save_expense: {
        Args: {
          p_amount: number
          p_expected_version?: number
          p_expense_id: string
          p_note?: string
          p_paid_by: string
          p_shares: Json
          p_spent_on: string
          p_split_mode: string
          p_title: string
          p_token: string
        }
        Returns: Json
      }
      bs_save_member: {
        Args: {
          p_bank_account?: string
          p_bank_account_name?: string
          p_bank_bin?: string
          p_member_id: string
          p_name: string
          p_token: string
        }
        Returns: Json
      }
      bs_save_settlement: {
        Args: {
          p_amount: number
          p_from_member: string
          p_note?: string
          p_settled_on: string
          p_settlement_id: string
          p_to_member: string
          p_token: string
        }
        Returns: Json
      }
      bs_update_group: {
        Args: { p_name: string; p_token: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
