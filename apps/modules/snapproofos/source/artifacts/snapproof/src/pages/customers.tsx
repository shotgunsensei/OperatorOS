import { useState } from "react";
import { useListCustomers, useCreateCustomer } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function Customers() {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useListCustomers({ search });
  const { mutate: createCustomer, isPending: isCreating } = useCreateCustomer();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "", company: "" });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createCustomer({ data: newCustomer }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        setNewCustomer({ name: "", email: "", phone: "", company: "" });
        refetch();
      },
      onError: (err: any) => {
        toast({
          title: "Error",
          description: err.error || "Failed to create customer",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
        <div className="flex items-center gap-4">
          <Input 
            placeholder="Search customers..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>New Customer</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Customer</DialogTitle>
                <DialogDescription>
                  Add a new client to your roster.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" value={newCustomer.company} onChange={e => setNewCustomer({...newCustomer, company: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={newCustomer.email} onChange={e => setNewCustomer({...newCustomer, email: e.target.value})} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isCreating}>{isCreating ? "Saving..." : "Save"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded-lg"></div>)}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 font-medium text-muted-foreground">Name</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Company</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Email</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Jobs</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/customers/${customer.id}`} className="font-medium hover:text-primary transition-colors">
                      {customer.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{customer.company || "—"}</td>
                  <td className="px-6 py-4 text-muted-foreground">{customer.email || "—"}</td>
                  <td className="px-6 py-4 text-muted-foreground">{customer.jobsCount}</td>
                  <td className="px-6 py-4 text-muted-foreground">{new Date(customer.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {(!data?.customers || data.customers.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    No customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}