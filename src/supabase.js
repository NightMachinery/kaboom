const supabase = {
  auth: {
    async getUser() {
      return { data: { user: null } };
    },
    async signOut() {
      return { error: null };
    },
  },
  from() {
    throw new Error("Supabase is not used in the self-hosted build.");
  },
};

export default supabase;
