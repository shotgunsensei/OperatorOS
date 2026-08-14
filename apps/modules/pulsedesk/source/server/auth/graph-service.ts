export interface GraphUserProfile {
  id: string;
  displayName: string;
  mail?: string;
  userPrincipalName?: string;
  department?: string;
  jobTitle?: string;
  manager?: { id: string; displayName: string } | null;
  officeLocation?: string;
}

export interface GraphGroup {
  id: string;
  displayName: string;
  description?: string;
}

export interface GraphOrgMetadata {
  tenantId: string;
  displayName: string;
  verifiedDomains: string[];
}

export interface IGraphService {
  getUserProfile(accessToken: string): Promise<GraphUserProfile>;
  getUserGroups(accessToken: string): Promise<GraphGroup[]>;
  getOrganizationMetadata(accessToken: string): Promise<GraphOrgMetadata>;
  getUserManager(accessToken: string): Promise<GraphUserProfile | null>;
  lookupGroupById(accessToken: string, groupId: string): Promise<GraphGroup | null>;
}

export class GraphServicePlaceholder implements IGraphService {
  async getUserProfile(_accessToken: string): Promise<GraphUserProfile> {
    throw new Error("Graph integration not yet implemented. Enable in tenant settings when available.");
  }

  async getUserGroups(_accessToken: string): Promise<GraphGroup[]> {
    throw new Error("Graph integration not yet implemented");
  }

  async getOrganizationMetadata(_accessToken: string): Promise<GraphOrgMetadata> {
    throw new Error("Graph integration not yet implemented");
  }

  async getUserManager(_accessToken: string): Promise<GraphUserProfile | null> {
    throw new Error("Graph integration not yet implemented");
  }

  async lookupGroupById(_accessToken: string, _groupId: string): Promise<GraphGroup | null> {
    throw new Error("Graph integration not yet implemented");
  }
}

export const graphService = new GraphServicePlaceholder();
