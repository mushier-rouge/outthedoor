'use client';

import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { CreateBriefInput } from '@/lib/validation/brief';
import { apiCreateBrief } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const formSchema = z.object({
  zipcode: z.string().min(5).max(10),
  maxOTD: z.coerce.number().positive(),
  makes: z.string().min(1),
  models: z.string().min(1),
  trims: z.string().optional(),
  colors: z.string().optional(),
  mustHaves: z.string().optional(),
  timelinePreference: z.string().min(3),
});

type FormValues = z.infer<typeof formSchema>;
type PaymentType = 'cash' | 'finance' | 'lease';

type PaymentOptionState = {
  enabled: boolean;
  downPayment: string;
  monthlyBudget: string;
};

const createInitialPaymentOptions = (): Record<PaymentType, PaymentOptionState> => ({
  cash: { enabled: true, downPayment: '', monthlyBudget: '' },
  finance: { enabled: false, downPayment: '', monthlyBudget: '' },
  lease: { enabled: false, downPayment: '', monthlyBudget: '' },
});

const paymentCopy: Record<PaymentType, { title: string; description: string }> = {
  cash: { title: 'Cash / Wire', description: 'Pay in full with no financing.' },
  finance: { title: 'Finance', description: 'Set the down payment and monthly budget you are comfortable with.' },
  lease: { title: 'Lease', description: 'Tell dealers the down payment and monthly budget that works for you.' },
};

const splitList = (value: string | undefined) =>
  value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export function BriefForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentOptions, setPaymentOptions] = useState(createInitialPaymentOptions);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      zipcode: '',
      maxOTD: 45000,
      makes: '',
      models: '',
      trims: '',
      colors: '',
      mustHaves: '',
      timelinePreference: 'Ready to purchase within 30 days',
    },
  });

  const paymentOptionEntries = useMemo(() => Object.entries(paymentCopy) as [PaymentType, { title: string; description: string }][], []);

  const resetPaymentOptions = () => setPaymentOptions(createInitialPaymentOptions());

  const updatePaymentToggle = (type: PaymentType, enabled: boolean) => {
    setPaymentOptions((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        enabled,
      },
    }));
  };

  const updatePaymentField = (type: PaymentType, field: 'downPayment' | 'monthlyBudget', value: string) => {
    setPaymentOptions((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: value,
      },
    }));
  };

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    setPaymentError(null);

    const enabledPreferences = (Object.entries(paymentOptions) as [PaymentType, PaymentOptionState][]) 
      .filter(([, option]) => option.enabled);

    if (enabledPreferences.length === 0) {
      setPaymentError('Select at least one payment type.');
      setIsSubmitting(false);
      return;
    }

    const preferences: CreateBriefInput['paymentPreferences'] = [];

    for (const [type, option] of enabledPreferences) {
      if (type === 'cash') {
        preferences.push({ type });
        continue;
      }

      const downPaymentValue = option.downPayment.trim();
      const monthlyBudgetValue = option.monthlyBudget.trim();

      if (!downPaymentValue) {
        setPaymentError(`Enter a down payment for ${paymentCopy[type].title.toLowerCase()}.`);
        setIsSubmitting(false);
        return;
      }

      if (!monthlyBudgetValue) {
        setPaymentError(`Enter a monthly budget for ${paymentCopy[type].title.toLowerCase()}.`);
        setIsSubmitting(false);
        return;
      }

      const downPayment = Number(downPaymentValue);
      const monthlyBudget = Number(monthlyBudgetValue);

      if (Number.isNaN(downPayment) || downPayment < 0) {
        setPaymentError(`Down payment for ${paymentCopy[type].title.toLowerCase()} must be a non-negative number.`);
        setIsSubmitting(false);
        return;
      }

      if (Number.isNaN(monthlyBudget) || monthlyBudget <= 0) {
        setPaymentError(`Monthly budget for ${paymentCopy[type].title.toLowerCase()} must be greater than zero.`);
        setIsSubmitting(false);
        return;
      }

      preferences.push({
        type,
        downPayment,
        monthlyBudget,
      });
    }

    try {
      const payload: CreateBriefInput = {
        zipcode: values.zipcode.trim(),
        paymentPreferences: preferences,
        paymentType: preferences[0]?.type,
        maxOTD: values.maxOTD,
        makes: splitList(values.makes),
        models: splitList(values.models),
        trims: splitList(values.trims),
        colors: splitList(values.colors),
        mustHaves: splitList(values.mustHaves),
        timelinePreference: values.timelinePreference.trim(),
      };

      const { brief } = await apiCreateBrief(payload);
      toast.success('Brief created');
      resetPaymentOptions();
      form.reset();
      router.push(`/briefs/${(brief as { id: string }).id}`);
    } catch (error) {
      console.error(error);
      toast.error('Could not create brief', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="zipcode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Buyer ZIP</FormLabel>
                <FormControl>
                  <Input placeholder="98109" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxOTD"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max OTD budget</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="500"
                    min="0"
                    value={field.value ?? ''}
                    onChange={(event) => {
                      const numericValue = event.target.valueAsNumber;
                      field.onChange(Number.isNaN(numericValue) ? undefined : numericValue);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="timelinePreference"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Timeline</FormLabel>
                <FormControl>
                  <Input placeholder="Within 30 days" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">Payment preferences</h2>
            <p className="text-sm text-muted-foreground">
              Select every payment path you are open to. We share your down payment and monthly targets with dealers.
            </p>
          </div>
          <div className="space-y-3">
            {paymentOptionEntries.map(([type, copy]) => {
              const option = paymentOptions[type];
              const checkboxId = `payment-${type}`;
              return (
                <div key={type} className="space-y-3 rounded-md border p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={checkboxId}
                      checked={option.enabled}
                      onCheckedChange={(checked) => updatePaymentToggle(type, Boolean(checked))}
                    />
                    <div>
                      <label htmlFor={checkboxId} className="text-sm font-medium capitalize">
                        {copy.title}
                      </label>
                      <p className="text-xs text-muted-foreground">{copy.description}</p>
                    </div>
                  </div>
                  {type !== 'cash' && option.enabled && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`${checkboxId}-down`}>Down payment</Label>
                        <Input
                          id={`${checkboxId}-down`}
                          type="number"
                          min="0"
                          step="500"
                          value={option.downPayment}
                          onChange={(event) => updatePaymentField(type, 'downPayment', event.target.value)}
                          placeholder="5000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${checkboxId}-monthly`}>Target monthly payment</Label>
                        <Input
                          id={`${checkboxId}-monthly`}
                          type="number"
                          min="0"
                          step="50"
                          value={option.monthlyBudget}
                          onChange={(event) => updatePaymentField(type, 'monthlyBudget', event.target.value)}
                          placeholder="650"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {paymentError && <p className="text-sm text-destructive">{paymentError}</p>}
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="makes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Makes</FormLabel>
                <FormControl>
                  <Textarea placeholder="Toyota, Honda" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="models"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Models</FormLabel>
                <FormControl>
                  <Textarea placeholder="Grand Highlander, Pilot" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="trims"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preferred trims</FormLabel>
                <FormControl>
                  <Textarea placeholder="Limited, Touring" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="colors"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color palette</FormLabel>
                <FormControl>
                  <Textarea placeholder="Cloudburst Gray, Black" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mustHaves"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Must-haves</FormLabel>
                <FormControl>
                  <Textarea placeholder="Captain seats, Tow package" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Create brief'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
