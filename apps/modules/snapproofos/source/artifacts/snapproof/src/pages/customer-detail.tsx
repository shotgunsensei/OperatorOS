import { useParams, Link } from "wouter";
import { useGetCustomer, getGetCustomerQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export default function CustomerDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { data: customer, isLoading } = useGetCustomer(id, { query: { enabled: !!id, queryKey: getGetCustomerQueryKey(id) } });

  if (isLoading) {
    return <div className="p-8"><div className="animate-pulse h-8 w-64 bg-muted rounded mb-8"></div></div>;
  }

  if (!customer) {
    return <div className="p-8">Customer not found.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/customers" className="text-muted-foreground hover:text-foreground">
          &larr; Back to Customers
        </Link>
      </div>
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{customer.name}</h1>
          <p className="text-muted-foreground mt-1">
            {customer.company || "No Company"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Edit Info</Button>
          <Button>New Job for Customer</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">Contact Info</h2>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs">Email</span>
                {customer.email || "—"}
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Phone</span>
                {customer.phone || "—"}
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Address</span>
                {customer.address || "—"}
              </div>
            </div>
          </div>
        </div>
        
        <div className="md:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-bold mb-4">Job History ({customer.jobsCount})</h2>
            <div className="text-sm text-muted-foreground">
              History view placeholder
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}