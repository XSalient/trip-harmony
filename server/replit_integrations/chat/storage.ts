export interface IChatStorage {
  getConversation(id: number): Promise<unknown>;
  getAllConversations(): Promise<unknown[]>;
  createConversation(title: string): Promise<unknown>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<unknown[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<unknown>;
}

export const chatStorage: IChatStorage = {
  async getConversation(_id: number) { return undefined; },
  async getAllConversations() { return []; },
  async createConversation(_title: string) { return {}; },
  async deleteConversation(_id: number) {},
  async getMessagesByConversation(_conversationId: number) { return []; },
  async createMessage(_conversationId: number, _role: string, _content: string) { return {}; },
};
