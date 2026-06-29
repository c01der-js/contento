export default async function DataDeletionPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const ru = locale === 'ru'

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold">
        {ru ? 'Удаление данных' : 'Data Deletion Instructions'}
      </h1>
      <p className="text-sm text-gray-500 mt-1">
        {ru
          ? 'Последнее обновление: июнь 2026'
          : 'Last updated: June 2026'}
      </p>

      {ru ? (
        <>
          <p className="text-sm text-gray-600 mt-4 leading-relaxed">
            Настоящая страница предназначена для конечных пользователей — клиентов
            бизнесов, использующих Contento. Если вы обращались в компанию через
            Instagram Direct и хотите, чтобы ваши данные были удалены из системы,
            следуйте инструкциям ниже.
          </p>

          <h2 className="text-lg font-medium mt-8">
            Как подать запрос на удаление данных
          </h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Отправьте письмо на адрес <strong>[CONTACT_EMAIL]</strong> с темой:
          </p>
          <p className="mt-3 rounded-md bg-gray-100 px-4 py-3 text-sm font-mono text-gray-800">
            Запрос на удаление данных
          </p>
          <p className="text-sm text-gray-600 mt-3 leading-relaxed">
            В теле письма укажите:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 mt-2 leading-relaxed space-y-1">
            <li>ваше имя пользователя Instagram (username), с которого вы обращались;</li>
            <li>
              при наличии — номер телефона, который вы указывали в переписке.
            </li>
          </ul>

          <h2 className="text-lg font-medium mt-8">Что будет удалено</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            После подтверждения личности мы удалим из наших систем:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 mt-2 leading-relaxed space-y-1">
            <li>историю ваших сообщений в Instagram Direct, хранящуюся в нашей базе данных;</li>
            <li>ваши контактные данные (имя, username, номер телефона);</li>
            <li>запись о лиде, связанную с вашим профилем.</li>
          </ul>

          <h2 className="text-lg font-medium mt-8">Сроки исполнения</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Мы обработаем ваш запрос в течение{' '}
            <strong>30 календарных дней</strong> с момента получения и подтверждения
            личности. По завершении удаления мы направим вам уведомление на
            указанный в запросе контакт.
          </p>

          <h2 className="text-lg font-medium mt-8">Обратите внимание</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Данная страница касается только данных, которые мы обрабатываем как
            часть функции «Ассистент продаж в Instagram». Если вы являетесь
            зарегистрированным пользователем Contento и хотите удалить свой
            аккаунт — обратитесь по тому же адресу с темой «Удаление аккаунта».
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 mt-4 leading-relaxed">
            This page is intended for end-users — customers of businesses that
            use Contento. If you contacted a business via Instagram Direct and
            would like your data removed from our system, follow the instructions
            below.
          </p>

          <h2 className="text-lg font-medium mt-8">
            How to Submit a Data Deletion Request
          </h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Send an email to <strong>[CONTACT_EMAIL]</strong> with the subject
            line:
          </p>
          <p className="mt-3 rounded-md bg-gray-100 px-4 py-3 text-sm font-mono text-gray-800">
            Data deletion request
          </p>
          <p className="text-sm text-gray-600 mt-3 leading-relaxed">
            In the body of the email please include:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 mt-2 leading-relaxed space-y-1">
            <li>your Instagram username from which you sent the messages;</li>
            <li>
              if applicable, the phone number you shared during the conversation.
            </li>
          </ul>

          <h2 className="text-lg font-medium mt-8">What Will Be Deleted</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            After verifying your identity, we will delete from our systems:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 mt-2 leading-relaxed space-y-1">
            <li>the history of your Instagram Direct messages stored in our database;</li>
            <li>your contact information (name, username, phone number);</li>
            <li>the lead record associated with your profile.</li>
          </ul>

          <h2 className="text-lg font-medium mt-8">Timeframe</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            We will process your request within{' '}
            <strong>30 calendar days</strong> of receiving and verifying your
            identity. You will receive a confirmation once the deletion is
            complete.
          </p>

          <h2 className="text-lg font-medium mt-8">Please Note</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            This page covers only data we process as part of the Instagram Sales
            Assistant feature. If you are a registered Contento user and want to
            delete your account, contact the same address with the subject
            &#8220;Account deletion&#8221;.
          </p>
        </>
      )}

      <p className="text-xs text-gray-400 mt-12 italic">
        {ru
          ? 'Этот документ является шаблоном и должен быть проверен владельцем бизнеса и/или юристом перед публикацией.'
          : 'This document is a template and must be reviewed by the business owner and/or legal counsel before publication.'}
      </p>
    </div>
  )
}
