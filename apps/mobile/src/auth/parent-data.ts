import type { BareTraenClient } from "@bare-traen/api-client";

export type ParentProfile = {
  displayName: string;
  id: string;
};

export type ParentFamily = {
  id: string;
  name: string;
  role: "owner" | "caregiver";
};

export type ParentChild = {
  avatarSeed: string | null;
  avatarUrl: string | null;
  displayName: string;
  familyId: string;
  id: string;
};

export type ParentBootstrap = {
  children: ParentChild[];
  family: ParentFamily | null;
  profile: ParentProfile;
};

export class ParentBootstrapError extends Error {
  constructor() {
    super("Parent data could not be loaded.");
    this.name = "ParentBootstrapError";
  }
}

function fail(): never {
  throw new ParentBootstrapError();
}

export async function loadParentBootstrap(
  client: BareTraenClient,
): Promise<ParentBootstrap> {
  const { data: identity, error: identityError } = await client.auth.getUser();
  const user = identity.user;

  if (identityError || !user) {
    fail();
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.id !== user.id) {
    fail();
  }

  const { data: membership, error: membershipError } = await client
    .from("family_memberships")
    .select("family_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    fail();
  }

  if (!membership) {
    return {
      children: [],
      family: null,
      profile: { displayName: profile.display_name, id: profile.id },
    };
  }

  const [{ data: family, error: familyError }, childrenResponse] =
    await Promise.all([
      client
        .from("families")
        .select("id, name")
        .eq("id", membership.family_id)
        .maybeSingle(),
      client
        .from("child_profiles")
        .select(
          "id, family_id, display_name, avatar_url, avatar_seed, is_active",
        )
        .eq("family_id", membership.family_id)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
    ]);

  if (
    familyError ||
    !family ||
    family.id !== membership.family_id ||
    childrenResponse.error
  ) {
    fail();
  }

  const children = (childrenResponse.data ?? []).map((child) => ({
    avatarSeed: child.avatar_seed,
    avatarUrl: child.avatar_url,
    displayName: child.display_name,
    familyId: child.family_id,
    id: child.id,
  }));

  return {
    children,
    family: {
      id: family.id,
      name: family.name,
      role: membership.role,
    },
    profile: { displayName: profile.display_name, id: profile.id },
  };
}
