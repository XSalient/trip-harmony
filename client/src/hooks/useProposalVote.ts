import { useCallback } from "react";
import { toast } from "sonner";

interface MutationCallbacks {
  onSuccess: () => void;
  onError: () => void;
}

interface Voter {
  id?: number;
  name?: string | null;
}

/**
 * The shared optimistic-vote handler.
 *
 * Six screens each carried a byte-for-byte near-identical copy of this logic,
 * differing in exactly two ways: how they settle afterwards (detail pages
 * invalidate the list query, the dashboard calls a local refetch) and what
 * shape they push into the optimistic array (detail pages include the voter so
 * they can render names, the dashboard does not).
 *
 * Both differences are handled by passing `settle` and always writing the
 * superset — callers that do not need the voter simply ignore it.
 *
 * `writeList` and `settle` stay as closures rather than the hook reaching into
 * tRPC itself: making it generic over `utils.<router>.list` produces inference
 * errors that end in @ts-ignore.
 */
export function useProposalVote<TWire extends string>(opts: {
  /** The current user, for the optimistic entry. */
  user: Voter | null | undefined;
  /** Applies an updater to the cached list, e.g. utils.dates.list.setData. */
  writeList: (updater: (old: any) => any) => void;
  /** Re-syncs with the server once the mutation resolves, either way. */
  settle: () => void;
  submitVote: (proposalId: number, wire: TWire, cb: MutationCallbacks) => void;
  submitUnvote: (proposalId: number, cb: MutationCallbacks) => void;
  errorMessage?: string;
}) {
  const { user, writeList, settle, submitVote, submitUnvote, errorMessage } =
    opts;

  return useCallback(
    (proposalId: number, wire: TWire, isUnvote: boolean) => {
      writeList((old: any) => {
        if (!old) return old;
        return old.map((p: any) => {
          if (p.id !== proposalId) return p;
          const others =
            p.votes?.filter((v: any) => v.userId !== user?.id) ?? [];
          return {
            ...p,
            votes: isUnvote
              ? others
              : [
                  ...others,
                  {
                    userId: user?.id,
                    vote: wire,
                    user: { id: user?.id, name: user?.name },
                  },
                ],
          };
        });
      });

      const cb: MutationCallbacks = {
        onSuccess: settle,
        onError: () => {
          settle();
          toast.error(errorMessage ?? "Couldn't save your vote");
        },
      };

      if (isUnvote) submitUnvote(proposalId, cb);
      else submitVote(proposalId, wire, cb);
    },
    [
      user?.id,
      user?.name,
      writeList,
      settle,
      submitVote,
      submitUnvote,
      errorMessage,
    ]
  );
}
