import Client from "../models/Client.js";


export const addClient = async (req, res, next) => {
    try {
        const client = new Client(req.body);
        await client.save();

        successResponse(res, "New client added!", 201, client)
    } catch (error) {
        next(error);
    }
};

export const getClients = async (req, res, next) => {
    try {
        const clients = await Client.find({ isActive: true }).sort({ shopName: 1 });
        successResponse(res, "clinets", 200, clients)
    } catch (error) {
        next(error);
    }
};

export const getClientById = async (req, res, next) => {
    const { id } = req?.params;
    try {
        const client = await Client.findOne({ _id: id, isActive: true });
        successResponse(res, "client", 200, client)
    } catch (error) {
        next(error);
    }
};