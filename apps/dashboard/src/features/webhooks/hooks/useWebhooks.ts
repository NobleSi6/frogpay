"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  webhooksService,
  type CreateWebhookEndpointInput,
  type UpdateWebhookEndpointInput,
  type WebhookDeliveriesFilters,
} from "../services/webhooks.service";

const endpointsQueryKey = ["webhook-endpoints"];
const deliveriesQueryKey = ["webhook-deliveries"];

export function useWebhookEndpoint(id: string) {
  return useQuery({
    queryKey: [...endpointsQueryKey, id],
    queryFn: () => webhooksService.getEndpoint(id),
    enabled: Boolean(id),
  });
}

export function useWebhookEndpoints() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: endpointsQueryKey,
    queryFn: webhooksService.listEndpoints,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateWebhookEndpointInput) => webhooksService.createEndpoint(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: endpointsQueryKey }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWebhookEndpointInput }) =>
      webhooksService.updateEndpoint(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: endpointsQueryKey }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => webhooksService.deleteEndpoint(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: endpointsQueryKey }),
  });

  const rotateMutation = useMutation({
    mutationFn: (id: string) => webhooksService.rotateSecret(id),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => webhooksService.sendTest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveriesQueryKey }),
  });

  return {
    ...query,
    createEndpoint: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateEndpoint: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteEndpoint: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    rotateSecret: rotateMutation.mutateAsync,
    isRotating: rotateMutation.isPending,
    sendTest: testMutation.mutateAsync,
    isSendingTest: testMutation.isPending,
  };
}

export function useWebhookDeliveries(filters: WebhookDeliveriesFilters = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...deliveriesQueryKey, filters],
    queryFn: () => webhooksService.listDeliveries(filters),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => webhooksService.retryDelivery(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveriesQueryKey }),
  });

  return {
    ...query,
    retryDelivery: retryMutation.mutateAsync,
    retryDeliveryNow: retryMutation.mutate,
    retryError: retryMutation.error,
    isRetrying: retryMutation.isPending,
  };
}

export function useWebhookDelivery(id: string) {
  return useQuery({
    queryKey: [...deliveriesQueryKey, "detail", id],
    queryFn: () => webhooksService.getDelivery(id),
    enabled: Boolean(id),
  });
}
