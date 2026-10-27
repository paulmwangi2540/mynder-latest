import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuthStore } from "../stores/adminAuthStore";
import { getUsers } from "../services/usersService";
import { userQueryKeys } from "../queries/userQueryKeys";

export const USER_DATA_STALE_TIME = 5 * 60 * 1000;
const USER_DATA_GC_TIME = 15 * 60 * 1000;

export function userListQueryOptions(adminId: string) {
  return {
    queryKey: userQueryKeys.users(adminId),
    queryFn: getUsers,
    staleTime: USER_DATA_STALE_TIME,
    gcTime: USER_DATA_GC_TIME,
  };
}

export function useUsers(options: { enabled?: boolean } = {}) {
  const adminId = useAdminAuthStore((state) => state.admin?.id);
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const query = useQuery({
    ...userListQueryOptions(adminId ?? ""),
    enabled: Boolean(adminId && accessToken && options.enabled !== false),
  });

  return {
    users: query.data ?? [],
    hasData: query.data !== undefined,
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : "",
  };
}

export function useUser(userId: string) {
  const adminId = useAdminAuthStore((state) => state.admin?.id);
  const accessToken = useAdminAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: userQueryKeys.user(adminId ?? "", userId),
    queryFn: async () => {
      if (!adminId) {
        throw new Error("Unable to identify the signed-in admin.");
      }
      const users = await queryClient.fetchQuery(
        userListQueryOptions(adminId),
      );
      return users.find((user) => user.id === userId);
    },
    staleTime: USER_DATA_STALE_TIME,
    gcTime: USER_DATA_GC_TIME,
    enabled: Boolean(adminId && accessToken && userId),
  });
}
