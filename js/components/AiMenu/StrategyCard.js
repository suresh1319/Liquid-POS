export default function StrategyCard({ title, description, onEdit, icon }) {
  return (
    <div className="bg-white shadow-lg rounded-xl p-6 transition-all duration-300 hover:shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {icon && <div className="mr-4">{icon}</div>}
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        </div>
        <button
          onClick={onEdit}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
        >
          Edit
        </button>
      </div>
      <p className="mt-4 text-gray-600 whitespace-pre-wrap font-mono text-sm">{description}</p>
    </div>
  );
}