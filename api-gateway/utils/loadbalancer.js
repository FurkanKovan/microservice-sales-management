const loadbalancer = {};

// Round Robin - Loop services one by one and forward request if enabled
loadbalancer.ROUND_ROBIN = (service) => {
    const newIndex = ++service.index >= service.instances.length ? 0 : service.index;
    service.index = newIndex;

    if (!service.instances.some(instance => instance.enabled)) {
        throw new Error('No enabled instances available');
    }    

    return loadbalancer.isEnabled(service, newIndex, loadbalancer.ROUND_ROBIN);
};

// Find an enabled service in services recursively
loadbalancer.isEnabled = (service, index, loadBalanceStrategy) => {
    return service.instances[index].enabled ? index : loadBalanceStrategy(service);
};

module.exports = loadbalancer;